/**
 * Utility to download data as a CSV file in the browser.
 * @param data Array of objects to export
 * @param headers Array of { label: string, key: string } for column mapping
 * @param filename Name of the file to save
 */
export function downloadCSV(data: any[], headers: { label: string, key: string }[], filename: string) {
    if (!data || !data.length) return;

    const csvRows: string[] = [];

    // Header row
    csvRows.push(headers.map(h => `"${h.label.replace(/"/g, '""')}"`).join(","));

    // Data rows
    for (const row of data) {
        const values = headers.map(h => {
            const val = row[h.key];
            const escaped = String(val ?? "").replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(","));
    }

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
