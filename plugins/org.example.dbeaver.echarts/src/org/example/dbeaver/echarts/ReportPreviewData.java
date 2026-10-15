package org.example.dbeaver.echarts;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** Transient dashboard results cross separately from the persisted report definition. */
final class ReportPreviewData {
    private ReportPreviewData() { }

    static String fromDashboard(String report, String json) {
        if (json != null && json.length() > 16 * 1024 * 1024) throw new IllegalArgumentException("Dashboard preview exceeds 16 MiB.");
        if (json == null || json.isBlank()) return "{}";
        JsonObject input = JsonParser.parseString(json).getAsJsonObject(), result = new JsonObject();
        int cells = 0;
        for (var item : JsonParser.parseString(report).getAsJsonObject().getAsJsonArray("widgets")) {
            JsonObject widget = item.getAsJsonObject();
            String id = JsonFields.string(widget, "id");
            if (!input.has(id)) continue;
            JsonObject snapshot = input.getAsJsonObject(id);
            JsonArray columns = snapshot.getAsJsonArray("columns"), rows = snapshot.getAsJsonArray("rows");
            if (columns == null || columns.isEmpty() || columns.size() > 1000 || rows == null || rows.size() > 100_000) {
                throw new IllegalArgumentException("Invalid dashboard preview shape.");
            }
            cells += columns.size() * rows.size();
            if (cells > 250_000) throw new IllegalArgumentException("Dashboard preview exceeds 250,000 cells.");
            JsonArray cleanColumns = new JsonArray(), cleanRows = new JsonArray();
            for (var column : columns) {
                JsonObject clean = new JsonObject();
                String name = JsonFields.string(column.getAsJsonObject(), "name"), kind = JsonFields.string(column.getAsJsonObject(), "kind");
                if (name.length() > 200 || kind.length() > 40) throw new IllegalArgumentException("Invalid preview column.");
                clean.addProperty("name", name); clean.addProperty("kind", kind); cleanColumns.add(clean);
            }
            for (var row : rows) {
                if (!row.isJsonArray() || row.getAsJsonArray().size() != columns.size()) throw new IllegalArgumentException("Invalid preview row.");
                for (var value : row.getAsJsonArray()) if (!value.isJsonNull() && !value.isJsonPrimitive()) throw new IllegalArgumentException("Invalid preview cell.");
                cleanRows.add(row.deepCopy());
            }
            JsonObject clean = new JsonObject();
            clean.addProperty("schemaVersion", 1); clean.add("columns", cleanColumns); clean.add("rows", cleanRows);
            clean.addProperty("truncated", snapshot.has("truncated") && snapshot.get("truncated").getAsBoolean());
            result.add(JsonFields.string(widget, "sourceId"), clean);
        }
        return result.toString();
    }
}
