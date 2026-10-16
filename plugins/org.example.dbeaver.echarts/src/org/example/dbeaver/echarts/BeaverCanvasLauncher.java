package org.example.dbeaver.echarts;

import java.nio.file.Path;
import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.core.filesystem.EFS;
import org.eclipse.swt.SWT;
import org.eclipse.swt.widgets.FileDialog;
import org.eclipse.ui.handlers.HandlerUtil;
import org.eclipse.ui.ide.FileStoreEditorInput;
import org.jkiss.dbeaver.runtime.DBWorkbench;

/** Workbench entry points do not depend on an SQL editor or execute saved queries. */
public final class BeaverCanvasLauncher extends AbstractHandler {
    @Override public Object execute(ExecutionEvent event) throws ExecutionException {
        var window = HandlerUtil.getActiveWorkbenchWindowChecked(event);
        var page = window.getActivePage();
        String mode = event.getParameter("org.example.dbeaver.echarts.launcher.mode");
        try {
            if ("report".equals(mode)) page.showView(ReportDesignerView.ID);
            else if ("openDashboard".equals(mode) || "openReport".equals(mode)) {
                boolean report = "openReport".equals(mode);
                FileDialog dialog = new FileDialog(window.getShell(), SWT.OPEN);
                dialog.setText(report ? "Open BeaverCanvas report" : "Open BeaverCanvas dashboard");
                dialog.setFilterExtensions(new String[] { report ? "*.echarts-report.json" : "*.echarts-dashboard.json" });
                var project = DBWorkbench.getPlatform().getWorkspace().getActiveProject();
                if (project != null) dialog.setFilterPath(project.getAbsolutePath().resolve(report ? "Reports/ECharts" : "Dashboards/ECharts").toString());
                String selected = dialog.open();
                if (selected != null) page.openEditor(new FileStoreEditorInput(EFS.getLocalFileSystem().getStore(Path.of(selected).toUri())),
                    report ? "org.example.dbeaver.echarts.reportEditor" : DashboardEditor.ID);
            } else page.openEditor(new DashboardEditor.NewInput(), DashboardEditor.ID);
        } catch (Exception error) { throw new ExecutionException("Cannot open BeaverCanvas: " + error.getMessage(), error); }
        return null;
    }
}
