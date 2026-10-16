package org.example.dbeaver.echarts;

import com.google.gson.JsonParser;

/** No workbench or JDBC required: focused command scope and transient preview boundary. */
public final class EditingWorkflowTest {
    public static void main(String[] args) {
        Object browser = new Object(), nativeEditor = new Object();
        check(BrowserKeyBindings.ownsFocus(browser, browser), "Focused browser command was excluded");
        check(!BrowserKeyBindings.ownsFocus(nativeEditor, browser), "Native editor command was captured");
        check(!BrowserKeyBindings.ownsFocus(null, browser), "Absent focus activated browser commands");
        check(!BrowserKeyBindings.ownsFocus(null, null), "Disposed browser activated commands");
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
        System.out.println("Editing workflow OK: browser-only command scope, transient result routing, authority stripping and bounded preview validation");
    }
    private static void fail(Runnable action) { try { action.run(); } catch (IllegalArgumentException | IllegalStateException expected) { return; } throw new AssertionError("Invalid preview accepted"); }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}
