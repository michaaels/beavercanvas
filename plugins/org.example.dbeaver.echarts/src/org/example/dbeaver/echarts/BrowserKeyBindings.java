package org.example.dbeaver.echarts;

import org.eclipse.swt.SWT;
import org.eclipse.swt.browser.Browser;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.keys.IBindingService;

/** A focused embedded editor owns its shortcuts; restore the workbench on blur/disposal. */
final class BrowserKeyBindings {
    private static BrowserKeyBindings owner;
    private final IBindingService service;
    private boolean previous;

    BrowserKeyBindings(IBindingService service) { this.service = service; }

    static BrowserKeyBindings install(Browser browser) {
        if (!PlatformUI.isWorkbenchRunning()) return null;
        IBindingService service = PlatformUI.getWorkbench().getService(IBindingService.class);
        if (service == null) return null;
        BrowserKeyBindings keys = new BrowserKeyBindings(service);
        keys.attach(browser);
        return keys;
    }

    void attach(Browser browser) {
        browser.addListener(SWT.FocusIn, event -> acquire());
        browser.addListener(SWT.FocusOut, event -> release());
        browser.addListener(SWT.Dispose, event -> release());
        if (browser.isFocusControl()) acquire();
    }

    void acquire() {
        if (owner == this) return;
        if (owner != null) owner.release();
        previous = service.isKeyFilterEnabled();
        service.setKeyFilterEnabled(false);
        owner = this;
    }

    void release() {
        if (owner != this) return;
        owner = null;
        service.setKeyFilterEnabled(previous);
    }
}
