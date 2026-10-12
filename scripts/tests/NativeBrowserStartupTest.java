import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
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
            if (defer == null) throw new AssertionError("Opening was synchronous; production deferral is missing");
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
