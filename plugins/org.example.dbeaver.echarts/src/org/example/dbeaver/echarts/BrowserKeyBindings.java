package org.example.dbeaver.echarts;

import java.util.ArrayList;
import java.util.List;
import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.core.expressions.EvaluationResult;
import org.eclipse.core.expressions.Expression;
import org.eclipse.core.expressions.ExpressionInfo;
import org.eclipse.core.expressions.IEvaluationContext;
import org.eclipse.swt.SWT;
import org.eclipse.swt.browser.Browser;
import org.eclipse.swt.dnd.Clipboard;
import org.eclipse.swt.dnd.TextTransfer;
import org.eclipse.swt.dnd.Transfer;
import org.eclipse.ui.ISources;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.handlers.IHandlerActivation;
import org.eclipse.ui.handlers.IHandlerService;
import org.eclipse.ui.swt.IFocusService;

/** Edit commands apply only to this tracked browser. Never alter Eclipse's global key filter. */
final class BrowserKeyBindings {
    private final IHandlerService service;
    private final List<IHandlerActivation> activations = new ArrayList<>();
    private final List<AbstractHandler> handlers = new ArrayList<>();
    private IFocusService focus;
    private Browser browser;

    BrowserKeyBindings(IHandlerService service) { this.service = service; }

    static BrowserKeyBindings install(Browser browser) {
        return install(browser, false);
    }

    static BrowserKeyBindings install(Browser browser, boolean reportCommands) {
        if (!PlatformUI.isWorkbenchRunning()) return null;
        var workbench = PlatformUI.getWorkbench();
        IHandlerService service = workbench.getService(IHandlerService.class);
        IFocusService focus = workbench.getService(IFocusService.class);
        if (service == null || focus == null) return null;
        BrowserKeyBindings keys = new BrowserKeyBindings(service);
        keys.focus = focus; keys.attach(browser, reportCommands);
        return keys;
    }

    static boolean ownsFocus(Object focused, Object browser) { return browser != null && focused == browser; }

    void attach(Browser control) {
        attach(control, false);
    }
    void attach(Browser control, boolean reportCommands) {
        browser = control;
        if (focus != null) focus.addFocusTracker(control, "org.example.dbeaver.echarts.browser");
        Expression scope = new Expression() {
            @Override public EvaluationResult evaluate(IEvaluationContext context) {
                return EvaluationResult.valueOf(!control.isDisposed() && ownsFocus(context.getVariable(ISources.ACTIVE_FOCUS_CONTROL_NAME), control));
            }
            @Override public void collectExpressionInfo(ExpressionInfo info) { info.addVariableNameAccess(ISources.ACTIVE_FOCUS_CONTROL_NAME); }
        };
        var commands = new ArrayList<>(List.of("copy", "paste", "cut", "selectAll", "undo", "redo"));
        if (reportCommands) commands.addAll(List.of("save", "findReplace"));
        for (String command : commands) {
            AbstractHandler handler = new AbstractHandler() {
                @Override public boolean isEnabled() { return !control.isDisposed() && control.isFocusControl(); }
                @Override public Object execute(ExecutionEvent event) throws ExecutionException {
                    if (!isEnabled()) return null;
                    try { edit(command); }
                    catch (RuntimeException error) { throw new ExecutionException("BeaverCanvas could not " + command + " in the focused browser", error); }
                    return null;
                }
            };
            handlers.add(handler);
            activations.add(service.activateHandler(command.equals("save") ? "org.eclipse.ui.file.save" : "org.eclipse.ui.edit." + command, handler, scope));
        }
        control.addListener(SWT.Dispose, event -> release());
    }

    private void edit(String command) {
        if (command.equals("save") || command.equals("findReplace")) {
            browser.execute("(document.activeElement||document.body).dispatchEvent(new KeyboardEvent('keydown',{key:"
                + JsonWriter.write(command.equals("save") ? "s" : "f") + ",ctrlKey:true,bubbles:true,cancelable:true}));");
        } else if (command.equals("copy") || command.equals("cut")) {
            Object result = browser.evaluate("return (()=>{const e=document.activeElement;return e&&typeof e.selectionStart==='number'?e.value.slice(e.selectionStart,e.selectionEnd):String(window.getSelection()||'');})()");
            if (!(result instanceof String text) || text.isEmpty() || text.length() > 1_048_576) return;
            Clipboard clipboard = new Clipboard(browser.getDisplay());
            try { clipboard.setContents(new Object[] { text }, new Transfer[] { TextTransfer.getInstance() }); }
            finally { clipboard.dispose(); }
            if (command.equals("cut")) insert("");
        } else if (command.equals("paste")) {
            Clipboard clipboard = new Clipboard(browser.getDisplay());
            Object result;
            try { result = clipboard.getContents(TextTransfer.getInstance()); }
            finally { clipboard.dispose(); }
            if (result instanceof String text && text.length() <= 1_048_576) insert(text);
        } else if (command.equals("selectAll")) {
            browser.execute("{const e=document.activeElement;if(e&&typeof e.select==='function')e.select();else document.execCommand('selectAll');}");
        } else {
            browser.execute("{const e=document.activeElement||document.body;if(e.matches('input,textarea,[contenteditable]'))document.execCommand("
                + JsonWriter.write(command) + ");else e.dispatchEvent(new KeyboardEvent('keydown',{key:"
                + JsonWriter.write(command.equals("undo") ? "z" : "y") + ",ctrlKey:true,bubbles:true,cancelable:true}));}");
        }
    }

    private void insert(String text) {
        browser.execute("(()=>{const e=document.activeElement;if(!e||e.readOnly||e.disabled)return;const text=" + JsonWriter.write(text)
            + ";if(typeof e.selectionStart==='number'){if(!document.execCommand('insertText',false,text)){e.setRangeText(text,e.selectionStart,e.selectionEnd,'end');e.dispatchEvent(new Event('input',{bubbles:true}));}}"
            + "else if(e.isContentEditable)document.execCommand('insertText',false,text);})()");
    }

    void release() {
        if (!activations.isEmpty()) service.deactivateHandlers(activations);
        activations.clear();
        for (AbstractHandler handler : handlers) handler.dispose();
        handlers.clear();
        if (focus != null && browser != null) focus.removeFocusTracker(browser);
        focus = null; browser = null;
    }
}
