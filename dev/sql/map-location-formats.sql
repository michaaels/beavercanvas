-- Separate location columns. Map > Latitude and longitude columns.
SELECT ciudad, longitud, latitud,
       ROUND(SUM(ventas), 2) AS ventas,
       ROUND(SUM(costos), 2) AS costos
FROM echarts_test_sales
GROUP BY ciudad, longitud, latitud;

-- Combined coordinates. Choose Longitude, latitude as the coordinate order.
SELECT ciudad, CONCAT('[', longitud, ',', latitud, ']') AS coordinates,
       ROUND(SUM(ventas), 2) AS ventas
FROM echarts_test_sales
GROUP BY ciudad, longitud, latitud;

-- Geographic field. Map > Geographic point (GeoJSON / WKT).
SELECT ciudad, ST_AsText(POINT(longitud, latitud)) AS geo,
       ROUND(SUM(ventas), 2) AS ventas
FROM echarts_test_sales
GROUP BY ciudad, longitud, latitud;
