import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.eclipse.swt.SWT;
import org.eclipse.swt.browser.Browser;
import org.eclipse.swt.browser.BrowserFunction;
import org.eclipse.swt.layout.FillLayout;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.swt.widgets.Display;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Label;
import org.osgi.framework.Bundle;
import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;

/** Real SWT browser regression; uses no database or personal workbench/workspace. */
public final class NativeBrowserStartupTest implements BundleActivator {
    private Class<?> presentationType;
    private Method defer;
    private final AtomicReference<Throwable> failure = new AtomicReference<>();

    @Override public void start(BundleContext context) throws Exception {
        Bundle plugin = Arrays.stream(context.getBundles()).filter(bundle ->
            "org.example.dbeaver.echarts".equals(bundle.getSymbolicName())).findFirst().orElseThrow();
        presentationType = plugin.loadClass("org.example.dbeaver.echarts.EChartsPresentation");
        // An older installed package has no deferral; exercise its synchronous path
        // to verify that this regression exposes the Edge timeout before the fix.
        try { defer = presentationType.getDeclaredMethod("deferBrowserAction", Runnable.class); defer.setAccessible(true); }
        catch (NoSuchMethodException previousPackage) { defer = null; }
        Display display = new Display();
        Shell shell = new Shell(display, SWT.NO_TRIM);
        shell.setLayout(new FillLayout()); shell.setSize(960, 800);
        Object first = null;
        AtomicReference<Object> second = new AtomicReference<>();
        try {
            first = create(shell);
            Browser browser = browser(first);
            if (browser == null) throw new AssertionError("Initial native browser could not start");
            waitFor(display, () -> ready(browser), "initial report");
            final Object source = first;
            AtomicBoolean callbackActive = new AtomicBoolean(), callbackReturned = new AtomicBoolean();
            new BrowserFunction(browser, "nativeOpenReport", true, new String[0]) {
                @Override public Object function(Object[] arguments) {
                    callbackActive.set(true);
                    Runnable open = () -> {
                        try {
                            if (defer != null && callbackActive.get()) throw new AssertionError("Native opening re-entered the callback");
                            second.set(create(shell));
                        } catch (Throwable error) { failure.set(error); }
                    };
                    try {
                        if (defer == null) open.run();
                        else if (!Boolean.TRUE.equals(defer.invoke(source, open))) throw new AssertionError("Opening not accepted");
                    } catch (Throwable error) { failure.set(error); }
                    finally { callbackActive.set(false); callbackReturned.set(true); }
                    return true;
                }
            };
            browser.execute("setTimeout(function(){window.nativeOpenReport();},0);");
            waitFor(display, () -> callbackReturned.get() && second.get() != null, "callback return and second browser");
            Browser opened = browser(second.get());
            if (opened == null) {
                Composite root = (Composite) presentationType.getMethod("getControl").invoke(second.get());
                String error = Arrays.stream(root.getChildren()).filter(control -> control instanceof Label)
                    .map(control -> ((Label) control).getText()).findFirst().orElse("No startup details");
                throw new AssertionError("Second report startup failed: " + error);
            }
            waitFor(display, () -> ready(opened), "second Report Designer");
            if (Arrays.stream(presentationType.getDeclaredMethods()).anyMatch(method -> method.getName().equals("publishReport"))) testEditingWorkflow(display, plugin, second.get(), opened);
            if (defer == null) throw new AssertionError("Opening was synchronous; production deferral is missing");
            if (Arrays.stream(presentationType.getDeclaredMethods()).anyMatch(method -> method.getName().equals("writeReportExport"))) testDraftSave(display, source, browser);
            AtomicBoolean staleAction = new AtomicBoolean();
            defer.invoke(source, (Runnable) () -> staleAction.set(true));
            presentationType.getMethod("dispose").invoke(source);
            first = null;
            while (display.readAndDispatch()) { }
            if (staleAction.get()) throw new AssertionError("Disposed source still opened a workbench part");
            System.out.println("Native SWT/" + opened.getBrowserType() + " startup OK: callback returned before second Report Designer, page ready, disposed source ignored");
        } finally {
            if (second.get() != null) presentationType.getMethod("dispose").invoke(second.get());
            if (first != null) presentationType.getMethod("dispose").invoke(first);
            shell.dispose(); display.dispose();
        }
    }

    private void testDraftSave(Display display, Object source, Browser browser) throws Exception {
        Path folder = Files.createTempDirectory("beavercanvas-native-export-"), file = folder.resolve("draft.eml");
        Method write = presentationType.getDeclaredMethod("writeReportExport", Path.class, String.class, String.class, boolean.class);
        Method publish = presentationType.getDeclaredMethod("publishReportExportResult", String.class, Map.class);
        write.setAccessible(true); publish.setAccessible(true);
        AtomicBoolean returned = new AtomicBoolean();
        BrowserFunction save = new BrowserFunction(browser, "nativeSaveDraft", true, new String[0]) {
            @Override public Object function(Object[] arguments) {
                String id = (String) arguments[0], content = (String) arguments[1];
                try {
                    defer.invoke(source, (Runnable) () -> {
                        try {
                            if (!returned.get()) throw new AssertionError("Draft write re-entered the callback");
                            @SuppressWarnings("unchecked") Map<String, Object> result = (Map<String, Object>) write.invoke(source, file, content, "eml", false);
                            if (!Boolean.FALSE.equals(result.get("sent"))) throw new AssertionError("A draft must not be sent");
                            publish.invoke(source, id, result);
                        } catch (Throwable error) { failure.set(error); }
                    });
                } catch (Throwable error) { failure.set(error); }
                returned.set(true); return true;
            }
        };
        try {
            // Substitute only the path chooser; use real frontend EML generation,
            // deferred native file write and acknowledgement with a controlled path.
            browser.execute("window.dbeaverExportReportAsync=function(id,content){return window.nativeSaveDraft(id,content);};document.getElementById('reportStartHeading').click();document.getElementById('outlookReport').click();document.getElementById('saveReportEmail').click();");
            waitFor(display, () -> Boolean.TRUE.equals(browser.evaluate("return !document.getElementById('reportEmailDialog').open && document.getElementById('reportStatus').textContent.includes('Draft saved');")), "native draft acknowledgement");
            String eml = Files.readString(file);
            if (!eml.contains("X-Unsent: 1\r\n") || !eml.contains("To: \r\n")) throw new AssertionError("Blank-recipient draft was not written correctly");
            System.out.println("Native draft export OK: empty recipient, deferred write, EML file and frontend acknowledgement; controlled path, no email sent");
        } finally { save.dispose(); Files.deleteIfExists(file); Files.deleteIfExists(folder); }
    }

    private void testEditingWorkflow(Display display, Bundle plugin, Object target, Browser browser) throws Exception {
        Class<?> keys = plugin.loadClass("org.example.dbeaver.echarts.BrowserKeyBindings");
        var constructor = keys.getDeclaredConstructors()[0]; constructor.setAccessible(true);
        Class<?> serviceType = constructor.getParameterTypes()[0];
        var commands = new java.util.HashMap<String, Object[]>();
        Object service = java.lang.reflect.Proxy.newProxyInstance(serviceType.getClassLoader(), new Class<?>[] { serviceType }, (proxy, method, arguments) -> {
            if (method.getName().equals("activateHandler")) commands.put((String) arguments[0], arguments);
            return null;
        });
        Object lease = constructor.newInstance(service); Method attach = keys.getDeclaredMethod("attach", Browser.class); attach.setAccessible(true); attach.invoke(lease, browser);
        if (!commands.keySet().containsAll(java.util.Set.of("org.eclipse.ui.edit.copy", "org.eclipse.ui.edit.paste", "org.eclipse.ui.edit.cut", "org.eclipse.ui.edit.selectAll")))
            throw new AssertionError("Browser edit commands are missing");
        Method ownsFocus = keys.getDeclaredMethod("ownsFocus", Object.class, Object.class); ownsFocus.setAccessible(true);
        if (!Boolean.TRUE.equals(ownsFocus.invoke(null, browser, browser)) || Boolean.TRUE.equals(ownsFocus.invoke(null, browser.getParent(), browser)))
            throw new AssertionError("Browser edit scope includes a native control");
        Method load = presentationType.getDeclaredMethod("loadReport", String.class, String.class); load.setAccessible(true);
        String report = """
            {"format":"dbeaver-echarts-report","schemaVersion":1,"sources":[{"id":"q","sql":"SELECT city, sales FROM demo"}],
             "widgets":[{"id":"populated","type":"chart","sourceId":"q","layout":{"x":0,"y":0,"width":12,"height":8},
             "config":{"chart":{"chartType":"bar","xColumn":"city","yColumns":["sales"]}}}]}
            """;
        String runtime = """
            {"q":{"schemaVersion":1,"columns":[{"name":"city","kind":"STRING"},{"name":"sales","kind":"NUMERIC"}],"rows":[["Quito",100],["Cuenca",80]]}}
            """;
        load.invoke(target, report, runtime);
        waitFor(display, () -> Boolean.TRUE.equals(browser.evaluate("return document.querySelectorAll('.report-chart canvas').length===1 && document.getElementById('reportStatus').textContent.includes('Dashboard data ready');")), "transient preview load");
        String saved = (String) browser.evaluate("return JSON.stringify(window.DBeaverECharts.reportDocument());");
        if (saved.contains("\"rows\"")) throw new AssertionError("Transient rows entered the template");
        testBrowserEditing(display, browser, commands);
        System.out.println("Native editing workflow OK: focused browser commands registered without global key-filter changes; transferred preview renders without SQL and stays outside template; workbench service simulated");
    }

    private void testBrowserEditing(Display display, Browser browser, Map<String, Object[]> commands) throws Exception {
        browser.getShell().open();
        while (display.readAndDispatch()) { }
        var nativeShell = new Shell(display); nativeShell.setLayout(new org.eclipse.swt.layout.FillLayout()); nativeShell.setSize(400, 150);
        var nativeEditor = new org.eclipse.swt.custom.StyledText(nativeShell, SWT.MULTI);
        nativeEditor.setText("one two"); nativeShell.open(); nativeShell.forceActive(); nativeEditor.setFocus();
        try {
            nativeEditor.setCaretOffset(7); nativeEditor.invokeAction(org.eclipse.swt.custom.ST.SELECT_WORD_PREVIOUS);
            if (!nativeEditor.getSelectionText().equals("two")) throw new AssertionError("Native word selection stopped working");
            for (Object[] registration : commands.values()) {
                Method enabled = registration[1].getClass().getMethod("isEnabled"); enabled.setAccessible(true);
                if (Boolean.TRUE.equals(enabled.invoke(registration[1]))) throw new AssertionError("Native editor focus activated a browser command");
                Object expression = registration[2]; Method evaluate = java.util.Arrays.stream(expression.getClass().getMethods()).filter(method -> method.getName().equals("evaluate")).findFirst().orElseThrow();
                evaluate.setAccessible(true); Class<?> contextType = evaluate.getParameterTypes()[0];
                Object context = java.lang.reflect.Proxy.newProxyInstance(contextType.getClassLoader(), new Class<?>[] { contextType },
                    (proxy, method, arguments) -> method.getName().equals("getVariable") ? nativeEditor : null);
                if (!evaluate.invoke(expression, context).toString().equals("false")) throw new AssertionError("Scoped expression captured native editor focus");
            }
        } finally { nativeShell.dispose(); }
        browser.getShell().forceActive(); browser.setFocus();
        var clipboard = new org.eclipse.swt.dnd.Clipboard(display);
        Object original = clipboard.getContents(org.eclipse.swt.dnd.TextTransfer.getInstance());
        boolean canRestore = original instanceof String || clipboard.getAvailableTypes().length == 0;
        try {
            if (!canRestore) {
                System.out.println("Native clipboard check skipped to preserve a non-text desktop clipboard; native selection and command isolation passed");
                return;
            }
            clipboard.setContents(new Object[] { "SELECT city" }, new org.eclipse.swt.dnd.Transfer[] { org.eclipse.swt.dnd.TextTransfer.getInstance() });
            browser.execute("{const e=document.createElement('textarea');e.id='nativeEditingProbe';e.style.cssText='position:fixed;top:0;left:0;z-index:99999';e.value='old SQL';document.body.append(e);e.focus();e.select();}");
            waitFor(display, () -> Boolean.TRUE.equals(browser.evaluate("return document.activeElement?.id==='nativeEditingProbe';")), "native browser text focus");
            System.out.println("Native editing focus: browser=" + browser.isFocusControl() + ", control=" + display.getFocusControl());
            Method pasteEnabled = commands.get("org.eclipse.ui.edit.paste")[1].getClass().getMethod("isEnabled"); pasteEnabled.setAccessible(true);
            if (!Boolean.TRUE.equals(pasteEnabled.invoke(commands.get("org.eclipse.ui.edit.paste")[1]))) throw new AssertionError("Browser command disabled with a focused DOM editor");
            invokeEdit(commands.get("org.eclipse.ui.edit.paste")[1]);
            waitFor(display, () -> Boolean.TRUE.equals(browser.evaluate("return document.getElementById('nativeEditingProbe').value==='SELECT city';")), "native paste command");
            browser.execute("document.getElementById('nativeEditingProbe').setSelectionRange(0,6);");
            invokeEdit(commands.get("org.eclipse.ui.edit.copy")[1]);
            if (!"SELECT".equals(clipboard.getContents(org.eclipse.swt.dnd.TextTransfer.getInstance()))) throw new AssertionError("Browser copy did not reach the clipboard");
            invokeEdit(commands.get("org.eclipse.ui.edit.cut")[1]);
            waitFor(display, () -> Boolean.TRUE.equals(browser.evaluate("return document.getElementById('nativeEditingProbe').value===' city';")), "native cut command");
            invokeEdit(commands.get("org.eclipse.ui.edit.paste")[1]);
            waitFor(display, () -> Boolean.TRUE.equals(browser.evaluate("return document.getElementById('nativeEditingProbe').value==='SELECT city';")), "native paste after cut");
            System.out.println("Native clipboard OK: real SWT clipboard copy/cut/paste; native word selection and focused command expressions stay independent");
        } finally {
            if (canRestore) {
                if (original instanceof String text) clipboard.setContents(new Object[] { text }, new org.eclipse.swt.dnd.Transfer[] { org.eclipse.swt.dnd.TextTransfer.getInstance() });
                else clipboard.clearContents();
            }
            clipboard.dispose();
            if (!browser.isDisposed()) browser.execute("document.getElementById('nativeEditingProbe')?.remove();");
        }
    }

    private static void invokeEdit(Object handler) throws Exception {
        Method execute = java.util.Arrays.stream(handler.getClass().getMethods()).filter(method -> method.getName().equals("execute")).findFirst().orElseThrow();
        execute.setAccessible(true); execute.invoke(handler, new Object[] { null });
    }

    private Object create(Shell shell) throws Exception {
        Object presentation = presentationType.getConstructor().newInstance();
        Method create = Arrays.stream(presentationType.getDeclaredMethods()).filter(method -> method.getName().equals("createReport")).findFirst().orElseThrow();
        create.setAccessible(true);
        create.invoke(presentation, shell, "{\"format\":\"dbeaver-echarts-report\",\"schemaVersion\":1,\"sources\":[],\"widgets\":[]}", null, null, null, null);
        shell.layout(true, true);
        return presentation;
    }
    private Browser browser(Object presentation) throws Exception {
        var field = presentationType.getDeclaredField("browser"); field.setAccessible(true);
        return (Browser) field.get(presentation);
    }
    private boolean ready(Browser browser) {
        return Boolean.TRUE.equals(browser.evaluate("return Boolean(window.DBeaverECharts && document.querySelector('#reportCanvas'));") );
    }
    private void waitFor(Display display, BooleanSupplier ready, String phase) throws Exception {
        long deadline = System.nanoTime() + 30_000_000_000L;
        while (!ready.getAsBoolean()) {
            if (failure.get() != null) throw new AssertionError(phase, failure.get());
            if (System.nanoTime() > deadline) throw new AssertionError("Native timeout: " + phase);
            if (!display.readAndDispatch()) Thread.sleep(10);
        }
        if (failure.get() != null) throw new AssertionError(phase, failure.get());
    }
    @Override public void stop(BundleContext context) { }
}
