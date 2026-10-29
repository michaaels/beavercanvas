package org.example.dbeaver.echarts;

import com.google.gson.JsonObject;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.eclipse.ui.IEditorPart;
import org.eclipse.ui.IPartListener2;
import org.eclipse.ui.IWorkbenchPage;
import org.eclipse.ui.IWorkbenchPartReference;
import org.eclipse.ui.PlatformUI;
import org.jkiss.dbeaver.model.DBPContextProvider;
import org.jkiss.dbeaver.model.exec.DBCExecutionContext;
import org.jkiss.dbeaver.model.qm.QMUtils;

/** Runtime-only bindings to explicitly chosen editor contexts, never a connection fallback. */
final class EditorQuerySessions implements AutoCloseable {
    private record Session(WeakReference<DBCExecutionContext> context, WeakReference<IEditorPart> owner, String title) { }
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private IWorkbenchPage page;
    private final IPartListener2 listener = new IPartListener2() {
        @Override public void partClosed(IWorkbenchPartReference part) { removeOwner(part); }
        @Override public void partInputChanged(IWorkbenchPartReference part) { removeOwner(part); }
    };
    private void removeOwner(IWorkbenchPartReference part) {
        var owner = part.getPart(false);
        if (owner == null) return;
        sessions.entrySet().removeIf(entry -> entry.getValue().owner().get() == owner);
    }
    String list(DBCExecutionContext attached) {
        var visible = new HashSet<String>();
        if (attached != null && attached.isConnected()) visible.add(bind(attached, null, "This result's SQL session"));
        if (PlatformUI.isWorkbenchRunning()) {
            var window = PlatformUI.getWorkbench().getActiveWorkbenchWindow();
            var activePage = window == null ? null : window.getActivePage();
            if (page != activePage) { if (page != null) page.removePartListener(listener); page = activePage; if (page != null) page.addPartListener(listener); }
            if (page != null) for (var reference : page.getEditorReferences()) {
                var editor = reference.getEditor(false);
                if (editor instanceof DBPContextProvider provider) {
                    var context = provider.getExecutionContext();
                    if (context != null && context.isConnected() && visible.size() < 64) visible.add(bind(context, editor, editor.getTitle()));
                }
            }
        }
        sessions.keySet().retainAll(visible);
        var result = new ArrayList<Map<String, Object>>();
        sessions.forEach((id, session) -> {
            var context = session.context().get(); if (context == null) return;
            var container = context.getDataSource().getContainer(); var defaults = context.getContextDefaults();
            result.add(Map.of("sessionId", id, "title", session.title(), "connectionId", container.getId(), "connection", container.getName(),
                "project", container.getProject().getName(), "catalog", defaults == null || defaults.getDefaultCatalog() == null ? "" : defaults.getDefaultCatalog().getName(),
                "schema", defaults == null || defaults.getDefaultSchema() == null ? "" : defaults.getDefaultSchema().getName()));
        });
        return JsonWriter.write(result);
    }
    private String bind(DBCExecutionContext context, IEditorPart owner, String title) {
        for (var entry : sessions.entrySet()) if (entry.getValue().context().get() == context) return entry.getKey();
        String id = UUID.randomUUID().toString(); sessions.put(id, new Session(new WeakReference<>(context), new WeakReference<>(owner), title)); return id;
    }
    DBCExecutionContext resolve(JsonObject source) {
        var session = sessions.get(JsonFields.string(source, "sessionId")); var context = session == null ? null : session.context().get();
        if (context == null || !context.isConnected()) throw new IllegalStateException("The SQL editor session is unavailable. Open Query and select a connected editor session again.");
        var container = context.getDataSource().getContainer();
        if (!container.getId().equals(JsonFields.string(source, "connectionId")) || !container.getProject().getName().equals(JsonFields.string(source, "project"))) {
            throw new IllegalStateException("The editor session does not match this query's connection.");
        }
        return context;
    }
    static void requireIdle(DBCExecutionContext context) {
        var connection = QMUtils.getCurrentConnection(context);
        var execution = connection == null ? null : connection.getExecutionStack();
        if (execution != null && !execution.isClosed()) {
            throw new IllegalStateException("The SQL editor is executing a statement. Wait for it to finish, then refresh this chart.");
        }
    }
    @Override public void close() { if (page != null) page.removePartListener(listener); page = null; sessions.clear(); }
}
