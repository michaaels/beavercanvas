package org.example.dbeaver.echarts;

import com.google.gson.JsonParser;
import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicBoolean;
import org.eclipse.ui.keys.IBindingService;

/** No workbench or JDBC required: key-filter ownership and transient preview boundary. */
public final class EditingWorkflowTest {
    public static void main(String[] args) {
        AtomicBoolean enabled = new AtomicBoolean(true);
        IBindingService service = (IBindingService) Proxy.newProxyInstance(IBindingService.class.getClassLoader(), new Class<?>[] { IBindingService.class },
            (proxy, method, arguments) -> {
                if (method.getName().equals("isKeyFilterEnabled")) return enabled.get();
                if (method.getName().equals("setKeyFilterEnabled")) enabled.set((Boolean) arguments[0]);
                return null;
            });
        BrowserKeyBindings a = new BrowserKeyBindings(service), b = new BrowserKeyBindings(service);
        a.acquire(); check(!enabled.get(), "Host commands still intercept focused browser keys");
        b.acquire(); a.release(); check(!enabled.get(), "Old browser restored another browser's lease");
        b.release(); check(enabled.get(), "Workbench filter was not restored");
        enabled.set(false); a.acquire(); a.release(); check(!enabled.get(), "An already disabled host filter was enabled");
        String report = """
            {"widgets":[{"id":"chart","sourceId":"query-1"}]}
            """;
        String data = """
            {"chart":{"columns":[{"name":"city","kind":"STRING","password":"secret"}],"rows":[["Quito"]],
              "source":{"sql":"secret"},"approved":true,"truncated":true}}
            """;
        var preview = JsonParser.parseString(ReportPreviewData.fromDashboard(report, data)).getAsJsonObject();
        check(preview.getAsJsonObject("query-1").getAsJsonArray("rows").size() == 1, "Preview rows were lost");
        check(!preview.toString().contains("secret") && !preview.toString().contains("approved"), "Preview leaked authority or connection fields");
        fail(() -> ReportPreviewData.fromDashboard(report, data.replace("[[\"Quito\"]]", "[[1,2]]")));
        fail(() -> ReportPreviewData.fromDashboard(report, data.replace("[[\"Quito\"]]", "[[{}]]")));
        fail(() -> ReportPreviewData.fromDashboard(report, " ".repeat(16 * 1024 * 1024 + 1)));
        check(ReportPreviewData.fromDashboard(report, "{}").equals("{}"), "Missing runtime should stay empty");
        System.out.println("Editing workflow OK: key-filter handoff/restore, transient result routing, authority stripping and bounded preview validation");
    }
    private static void fail(Runnable action) { try { action.run(); } catch (IllegalArgumentException | IllegalStateException expected) { return; } throw new AssertionError("Invalid preview accepted"); }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}
