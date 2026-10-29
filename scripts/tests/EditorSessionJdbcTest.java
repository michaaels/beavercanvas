package org.example.dbeaver.echarts;

import com.google.gson.JsonParser;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.jkiss.dbeaver.model.DBPDataKind;
import org.jkiss.dbeaver.model.DBPDataSource;
import org.jkiss.dbeaver.model.DBPDataSourceContainer;
import org.jkiss.dbeaver.model.exec.*;
import org.jkiss.dbeaver.model.qm.QMUtils;

/** Real JDBC temporary-table and transaction test; DBeaver SPI adapters are test doubles. */
public final class EditorSessionJdbcTest {
    public static void main(String[] args) throws Exception {
        String url = System.getenv("ECHARTS_TEST_JDBC_URL");
        if (url == null) throw new IllegalArgumentException("Set ECHARTS_TEST_JDBC_URL for a dedicated test database");
        DashboardQueryControlsTest.installTestWorkbench(); QMUtils.initPlatform(false);
        var properties = new java.util.Properties(); properties.setProperty("user", System.getenv("ECHARTS_TEST_JDBC_USER"));
        properties.setProperty("password", System.getenv().getOrDefault("ECHARTS_TEST_JDBC_PASSWORD", ""));
        try (var loader = new java.net.URLClassLoader(new java.net.URL[]{java.nio.file.Path.of(System.getenv("ECHARTS_TEST_JDBC_DRIVER")).toUri().toURL()}, EditorSessionJdbcTest.class.getClassLoader())) {
        var driver = (java.sql.Driver)loader.loadClass("org.mariadb.jdbc.Driver").getConstructor().newInstance();
        try (Connection jdbc = driver.connect(url, properties)) {
            try (Statement sql = jdbc.createStatement()) {
                sql.execute("CREATE TEMPORARY TABLE beavercanvas_session_probe (amount DECIMAL(12,2))");
                sql.execute("INSERT INTO beavercanvas_session_probe VALUES (10.25), (20.50)");
            }
            try (Connection other = driver.connect(url, properties); Statement sql = other.createStatement()) {
                try { sql.executeQuery("SELECT * FROM beavercanvas_session_probe"); throw new AssertionError("Temporary table leaked to another physical connection"); }
                catch (java.sql.SQLException expected) { check("42S02".equals(expected.getSQLState()), "Expected a missing temporary table in the isolated connection"); }
            }
            jdbc.setAutoCommit(false);
            try (Statement sql = jdbc.createStatement()) { sql.execute("INSERT INTO beavercanvas_session_probe VALUES (5.00)"); }
            AtomicInteger closedContext = new AtomicInteger(), closedSession = new AtomicInteger();
            var project = proxy(org.jkiss.dbeaver.model.app.DBPProject.class, (o,m,a)->m.getName().equals("getName")?"SessionTests":fallback(m.getReturnType()));
            DBPDataSourceContainer container = proxy(DBPDataSourceContainer.class, (o,m,a)->switch(m.getName()) {
                case "isForceUseSingleConnection" -> true; case "getId" -> "test-connection"; case "getName" -> "MariaDB session fixture"; case "getProject" -> project;
                default -> fallback(m.getReturnType());
            });
            DBPDataSource source = proxy(DBPDataSource.class, (o,m,a)-> m.getName().equals("getContainer") ? container : fallback(m.getReturnType()));
            DBCSession session = proxy(DBCSession.class, (o,m,a)-> switch (m.getName()) {
                case "prepareStatement" -> statement(jdbc, (String)a[1]);
                case "close" -> { closedSession.incrementAndGet(); yield null; }
                default -> fallback(m.getReturnType());
            });
            DBCExecutionContext context = proxy(DBCExecutionContext.class, (o,m,a)-> switch(m.getName()) {
                case "isConnected" -> !jdbc.isClosed(); case "getDataSource" -> source; case "getContextId" -> 1L;
                case "openSession" -> session; case "close" -> { closedContext.incrementAndGet(); yield null; }
                default -> fallback(m.getReturnType());
            });
            try (var sessions = new EditorQuerySessions()) {
                String token=JsonParser.parseString(sessions.list(context)).getAsJsonArray().get(0).getAsJsonObject().get("sessionId").getAsString();
                var selected=new com.google.gson.JsonObject(); selected.addProperty("sessionId",token); selected.addProperty("project","SessionTests");selected.addProperty("connectionId","test-connection");
                check(sessions.resolve(selected)==context,"Session selection must resolve the exact context");
                selected.addProperty("connectionId","different-connection");
                try {sessions.resolve(selected);throw new AssertionError("Session binding accepted another connection");}
                catch(IllegalStateException expected){check(expected.getMessage().contains("does not match"),"Wrong binding failure");}
                selected.addProperty("connectionId","test-connection");sessions.close();
                try {sessions.resolve(selected);throw new AssertionError("Disposed session binding remained valid");}
                catch(IllegalStateException expected){check(expected.getMessage().contains("unavailable"),"Wrong disposed binding failure");}
            }
            AtomicReference<String> snapshot = new AtomicReference<>(); AtomicReference<Exception> error = new AtomicReference<>();
            var job = new DashboardQueryJob(()->context,"SELECT SUM(amount) AS total FROM beavercanvas_session_probe",100,1000,10,snapshot::set,error::set,List.of(),true);
            job.schedule(); check(job.join(15000,null),"Temporary-table query timed out");
            if (error.get()!=null) throw error.get();
            check(JsonParser.parseString(snapshot.get()).getAsJsonObject().getAsJsonArray("rows").get(0).getAsJsonArray().get(0).getAsDouble()==35.75,"Exact session must see its temporary table and uncommitted row");
            check(!jdbc.isClosed() && !jdbc.getAutoCommit() && closedContext.get()==0 && closedSession.get()==1,"The borrowed context/transaction must remain open and owned by its editor");
            jdbc.rollback();
            try (Statement sql=jdbc.createStatement(); ResultSet result=sql.executeQuery("SELECT SUM(amount) FROM beavercanvas_session_probe")) {
                result.next(); check(result.getDouble(1)==30.75,"The plugin must not commit the editor transaction");
            }
            System.out.println("Real MariaDB editor session OK: temporary table isolated between connections, uncommitted rows visible, selected database retained, no context close or implicit commit");
        }
        } finally { QMUtils.disposePlatform(); }
    }
    private static DBCStatement statement(Connection jdbc,String query) throws Exception {
        Statement statement=jdbc.createStatement(); AtomicReference<ResultSet> result=new AtomicReference<>();
        return proxy(DBCStatement.class,(o,m,a)->switch(m.getName()) {
            case "executeStatement" -> { boolean rows=statement.execute(query); result.set(statement.getResultSet()); yield rows; }
            case "openResultSet" -> result(result.get());
            case "setStatementTimeout" -> { statement.setQueryTimeout((int)a[0]); yield null; }
            case "setLimit" -> { statement.setMaxRows(((Number)a[1]).intValue()); yield null; }
            case "close" -> { statement.close(); yield null; }
            case "cancelBlock" -> { statement.cancel(); yield null; }
            default -> fallback(m.getReturnType());
        });
    }
    private static DBCResultSet result(ResultSet result) throws Exception {
        var metadata=result.getMetaData(); var attributes=new java.util.ArrayList<DBCAttributeMetaData>();
        for(int i=1;i<=metadata.getColumnCount();i++) {
            int column=i;
            attributes.add(proxy(DBCAttributeMetaData.class,(o,m,a)->switch(m.getName()) {
                case "getLabel","getName" -> metadata.getColumnLabel(column); case "getDataKind" -> DBPDataKind.NUMERIC;
                default -> fallback(m.getReturnType());
            }));
        }
        var meta=proxy(DBCResultSetMetaData.class,(o,m,a)->m.getName().equals("getAttributes")?attributes:fallback(m.getReturnType()));
        return proxy(DBCResultSet.class,(o,m,a)->switch(m.getName()) {
            case "getMeta" -> meta; case "nextRow" -> result.next(); case "getAttributeValue" -> result.getObject((int)a[0]+1);
            case "close" -> {result.close();yield null;} default -> fallback(m.getReturnType());
        });
    }
    @SuppressWarnings("unchecked") private static <T>T proxy(Class<T> type,InvocationHandler handler) {return (T)Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler);}
    private static Object fallback(Class<?> type) {if(type==boolean.class)return false;if(type==int.class)return 0;if(type==long.class)return 0L;return null;}
    private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
}
