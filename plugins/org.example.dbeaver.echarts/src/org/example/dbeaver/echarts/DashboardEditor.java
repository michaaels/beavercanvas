package org.example.dbeaver.echarts;

import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.swt.layout.FillLayout;
import org.eclipse.swt.SWT;
import org.eclipse.swt.widgets.FileDialog;
import org.eclipse.jface.resource.ImageDescriptor;
import org.eclipse.ui.IPersistableElement;
import org.eclipse.ui.ide.FileStoreEditorInput;
import org.eclipse.core.filesystem.EFS;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.ui.IEditorInput;
import org.eclipse.ui.IEditorSite;
import org.eclipse.ui.IFileEditorInput;
import org.eclipse.ui.IURIEditorInput;
import org.eclipse.ui.PartInitException;
import org.eclipse.ui.part.EditorPart;
import org.jkiss.dbeaver.model.app.DBPPlatformDesktop;
import org.jkiss.dbeaver.model.app.DBPProject;
import org.jkiss.dbeaver.runtime.DBWorkbench;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** A dashboard can outlive its SQL editor and result-set presentation. */
public final class DashboardEditor extends EditorPart {
    public static final String ID = "org.example.dbeaver.echarts.dashboardEditor";
    private Path file;
    private DBPProject project;
    private EChartsPresentation presentation;
    private String document;
    private String savedDocument;
    private String diskText;
    private boolean dirty;

    static final class NewInput implements IEditorInput {
        @Override public boolean exists() { return false; }
        @Override public ImageDescriptor getImageDescriptor() { return null; }
        @Override public String getName() { return "Untitled dashboard"; }
        @Override public IPersistableElement getPersistable() { return null; }
        @Override public String getToolTipText() { return "New BeaverCanvas dashboard"; }
        @Override public <T> T getAdapter(Class<T> adapter) { return null; }
    }

    @Override
    public void init(IEditorSite site, IEditorInput input) throws PartInitException {
        setSite(site);
        setInput(input);
        try {
            if (input instanceof NewInput) {
                project = DBWorkbench.getPlatform().getWorkspace().getActiveProject();
                document = "{\"format\":\"dbeaver-echarts-dashboard\",\"schemaVersion\":1,\"title\":\"Untitled dashboard\",\"widgets\":[],\"filters\":{},\"variables\":{}}";
                savedDocument = null; dirty = true; setPartName(input.getName()); return;
            }
            if (input instanceof IFileEditorInput workspaceInput) {
                file = Path.of(workspaceInput.getFile().getLocationURI());
                project = DBPPlatformDesktop.getInstance().getWorkspace().getProject(workspaceInput.getFile().getProject());
            } else if (input instanceof IURIEditorInput uriInput && "file".equalsIgnoreCase(uriInput.getURI().getScheme())) {
                file = Path.of(uriInput.getURI());
                project = DBWorkbench.getPlatform().getWorkspace().getProjects().stream()
                    .map(item -> (DBPProject) item)
                    .filter(item -> file.startsWith(item.getAbsolutePath())).findFirst()
                    .orElse(DBWorkbench.getPlatform().getWorkspace().getActiveProject());
            } else { throw new IllegalArgumentException("Open a local BeaverCanvas dashboard JSON file."); }
            document = DashboardFiles.read(file);
            savedDocument = document;
            diskText = Files.readString(file, StandardCharsets.UTF_8);
            setPartName(file.getFileName().toString());
        } catch (Exception e) { throw new PartInitException("Cannot open BeaverCanvas dashboard: " + e.getMessage(), e); }
    }

    @Override
    public void createPartControl(Composite parent) {
        parent.setLayout(new FillLayout());
        presentation = new EChartsPresentation();
        presentation.createStandalone(parent, document, project, this::configurationChanged, this::saveDocument, () -> setDirty(true));
    }

    private void configurationChanged(String configuration) {
        try {
            var config = com.google.gson.JsonParser.parseString(configuration).getAsJsonObject();
            document = DashboardFiles.canonical(config.get("dashboard").toString());
            setDirty(!document.equals(savedDocument));
        } catch (RuntimeException e) { setDirty(true); }
    }

    private void setDirty(boolean value) {
        if (dirty != value) { dirty = value; firePropertyChange(PROP_DIRTY); }
    }

    private String saveDocument(String text) {
        return saveDocument(text, false);
    }

    private String saveDocument(String text, boolean saveAs) {
        try {
            Path target = file;
            if (target == null || saveAs) {
                FileDialog dialog = new FileDialog(getSite().getShell(), SWT.SAVE);
                dialog.setText("Save BeaverCanvas dashboard (JSON and SQL)");
                dialog.setFilterExtensions(new String[] { "*.echarts-dashboard.json" }); dialog.setOverwrite(true);
                dialog.setFileName(file == null ? "Untitled dashboard" + DashboardFiles.SUFFIX : file.getFileName().toString());
                if (project != null) {
                    Path folder = project.getAbsolutePath().resolve("Dashboards/ECharts"); Files.createDirectories(folder);
                    dialog.setFilterPath(folder.toString());
                }
                String selected = dialog.open(); if (selected == null) return null;
                target = Path.of(selected);
            }
            // Avoid silently overwriting concurrent edits made in another editor/tool.
            if (target.equals(file) && (!Files.exists(file) || !Files.readString(file, StandardCharsets.UTF_8).equals(diskText))) {
                throw new IllegalStateException("The dashboard changed on disk. Reopen it before saving.");
            }
            DashboardFiles.write(target, text); file = target;
            document = DashboardFiles.read(file);
            savedDocument = document;
            diskText = Files.readString(file, StandardCharsets.UTF_8);
            setDirty(false);
            setInput(new FileStoreEditorInput(EFS.getLocalFileSystem().getStore(file.toUri())));
            setPartName(file.getFileName().toString());
            if (project != null) project.refreshProject();
            for (IFile resource : ResourcesPlugin.getWorkspace().getRoot().findFilesForLocationURI(file.toUri())) {
                resource.getParent().refreshLocal(IResource.DEPTH_ONE, null);
            }
            return file.toString();
        } catch (Exception e) {
            MessageDialog.openError(getSite().getShell(), "Save BeaverCanvas dashboard", e.getMessage());
            return null;
        }
    }

    @Override
    public void doSave(IProgressMonitor monitor) {
        try {
            // Read current browser state synchronously; do not lose the 250 ms pending update.
            saveDocument(presentation.currentDashboardDocument());
        } catch (Exception e) {
            MessageDialog.openError(getSite().getShell(), "Save BeaverCanvas dashboard", e.getMessage());
        }
    }

    @Override
    public void doSaveAs() {
        try { saveDocument(presentation.currentDashboardDocument(), true); }
        catch (Exception error) { MessageDialog.openError(getSite().getShell(), "Save BeaverCanvas dashboard", error.getMessage()); }
    }

    @Override
    public boolean isSaveAsAllowed() { return true; }

    @Override
    public boolean isDirty() { return dirty; }

    @Override
    public void setFocus() {
        if (presentation != null && presentation.getControl() != null) presentation.getControl().setFocus();
    }

    @Override
    public void dispose() {
        if (presentation != null) { presentation.dispose(); presentation = null; }
        super.dispose();
    }
}
