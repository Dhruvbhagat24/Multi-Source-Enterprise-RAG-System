import os
import pandas as pd
from core.document_ingestor import DocumentIngestor


class SheetIngestor(DocumentIngestor):
    """
    Ingestor for spreadsheet-like data (CSV, XLSX).
    Extraction-only: returns rows as dictionaries.
    """

    def can_handle(self, file_path: str) -> bool:
        return file_path.lower().endswith((".csv", ".xlsx"))

    def ingest(self, file_path: str):
        print(f"📊 SheetIngestor handling: {file_path}")

        ext = os.path.splitext(file_path)[1].lower()

        if ext == ".csv":
            df = pd.read_csv(file_path)
        elif ext == ".xlsx":
            df = pd.read_excel(file_path)
        else:
            raise ValueError(f"Unsupported sheet format: {file_path}")

        # Normalize column names
        df.columns = [str(c).strip() for c in df.columns]

        rows = []
        for idx, row in df.iterrows():
            row_dict = row.dropna().to_dict()
            row_dict["_row_index"] = idx
            rows.append(row_dict)

        print(f"✅ Extracted {len(rows)} rows from sheet")
        return rows
