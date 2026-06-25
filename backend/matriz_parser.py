import re
from pathlib import Path

import pandas as pd

CARRERA_FILES = {
    "ICA": "Matriz Tributación PE 2022 AMBIENTAL.xlsx",
    "ICC": "Matriz Tributación PE 2022 COMPUTACION.xlsx",
    "ICE": "Matriz Tributación PE 2022 ELECTRICA.xlsx",
    "IOC": "Matriz Tributación PE 2022 OBRAS CIVILES.xlsx",
    "ICI": "Matriz Tributación PE 2023 INDUSTRIAL.xlsx",
}

_CURSO_CODE_RE = re.compile(r"^[A-Z]{2,5}\d{3,4}")

_STOP_WORDS = {
    "a", "al", "con", "de", "del", "e", "el", "en", "es", "la", "las", "le",
    "les", "lo", "los", "o", "para", "por", "que", "se", "si", "su", "sus",
    "un", "una", "y", "ya",
}


def generar_texto_corto(texto: str, n_significant: int = 5) -> str:
    """Return the first n_significant non-stopword words, including connecting words."""
    words = texto.split()
    result: list[str] = []
    sig_count = 0
    for word in words:
        clean = re.sub(r"[.,;:()\[\]]+", "", word).lower()
        result.append(word)
        if clean and clean not in _STOP_WORDS:
            sig_count += 1
        if sig_count >= n_significant:
            break
    return " ".join(result)


def _parse_semestre(val) -> int | None:
    """Extract first integer from cell value. Returns None for empty/asterisk."""
    if val is None:
        return None
    if isinstance(val, float) and pd.isna(val):
        return None
    s = str(val).strip()
    if not s or s in ("*", "nan"):
        return None
    nums = re.findall(r"\d+", s)
    if nums:
        n = int(nums[0])
        if n >= 1:
            return n
    return None


def _find_header_row(df: pd.DataFrame) -> int:
    for i, row in df.iterrows():
        vals = [str(v).strip().upper() for v in row.values]
        if "CODIGO" in vals and "TITULO" in vals:
            return i
    raise ValueError("No se encontró fila header con CODIGO y TITULO")


def parse_matriz_tributacion(
    filepath: Path | str, carrera_code: str
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Parse a Matriz de Tributación PE Excel file.

    Returns:
        df_cursos:       [codigo, nombre, semestre, carrera]
        df_tributacion:  [codigo_curso, nombre_curso, semestre, carrera,
                          competencia_id, competencia_texto, tributa]
                         One row per (curso, competencia) where tributa=True.
        df_competencias: [carrera, competencia_id, competencia_texto, texto_corto]
                         All PE competencias including those with zero tributations.
    """
    filepath = Path(filepath)
    df_raw = pd.read_excel(filepath, header=None)
    header_row = _find_header_row(df_raw)

    df = pd.read_excel(filepath, header=header_row)
    cols = df.columns.tolist()

    # Layout: col 0=CODIGO, col 1=TITULO, col 2=semestre (header=carrera code), col 3+=PE
    pe_col_names = cols[3:]
    competencias = {i + 1: str(col).strip() for i, col in enumerate(pe_col_names)}

    # Keep only rows with a valid course code in column 0
    df = df.dropna(subset=[cols[0]])
    df = df[df[cols[0]].astype(str).str.match(_CURSO_CODE_RE)]

    cursos_rows: list[dict] = []
    tributacion_rows: list[dict] = []

    for _, row in df.iterrows():
        codigo = str(row[cols[0]]).strip()
        nombre = str(row[cols[1]]).strip() if pd.notna(row[cols[1]]) else ""
        semestre = _parse_semestre(row[cols[2]])
        if semestre is None:
            continue

        cursos_rows.append(
            {"codigo": codigo, "nombre": nombre, "semestre": semestre, "carrera": carrera_code}
        )

        for comp_id, comp_texto in competencias.items():
            cell = row[cols[3 + comp_id - 1]]
            if isinstance(cell, str):
                val = cell.strip().lower()
                # Legacy Excel files use "X"/"x" to mark any tribute; treat as level "c".
                # Future files may use "a"/"b"/"c" explicitly.
                nivel = "c" if val == "x" else val
            else:
                nivel = None
            if nivel in ("a", "b", "c"):
                tributacion_rows.append(
                    {
                        "codigo_curso": codigo,
                        "nombre_curso": nombre,
                        "semestre": semestre,
                        "carrera": carrera_code,
                        "competencia_id": comp_id,
                        "competencia_texto": comp_texto,
                        "nivel": nivel,
                    }
                )

    _empty_cursos = pd.DataFrame(columns=["codigo", "nombre", "semestre", "carrera"])
    _empty_trib = pd.DataFrame(
        columns=["codigo_curso", "nombre_curso", "semestre", "carrera",
                 "competencia_id", "competencia_texto", "nivel"]
    )
    df_cursos = pd.DataFrame(cursos_rows) if cursos_rows else _empty_cursos
    df_tributacion = pd.DataFrame(tributacion_rows) if tributacion_rows else _empty_trib
    df_competencias = pd.DataFrame(
        [
            {
                "carrera": carrera_code,
                "competencia_id": cid,
                "competencia_texto": ctxt,
                "texto_corto": generar_texto_corto(ctxt),
            }
            for cid, ctxt in competencias.items()
        ]
    )

    return df_cursos, df_tributacion, df_competencias


def parse_todas_las_matrices(
    data_folder: Path | str,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Parse all 5 Excel files and concatenate results.

    Returns:
        df_all_cursos, df_all_tributacion, df_all_competencias
    """
    data_folder = Path(data_folder)
    all_cursos: list[pd.DataFrame] = []
    all_tributacion: list[pd.DataFrame] = []
    all_competencias: list[pd.DataFrame] = []

    for carrera_code, filename in CARRERA_FILES.items():
        filepath = data_folder / filename
        if not filepath.exists():
            print(f"WARNING: {filepath} no encontrado, skipping")
            continue
        df_cursos, df_tributacion, df_competencias = parse_matriz_tributacion(filepath, carrera_code)
        all_cursos.append(df_cursos)
        all_tributacion.append(df_tributacion)
        all_competencias.append(df_competencias)
        max_sem = int(df_cursos["semestre"].max()) if not df_cursos.empty else 0
        print(
            f"  {carrera_code}: {len(df_cursos)} cursos, "
            f"{len(df_tributacion)} tributaciones, "
            f"{len(df_competencias)} competencias PE, "
            f"semestre máx={max_sem}"
        )

    df_all_cursos = pd.concat(all_cursos, ignore_index=True) if all_cursos else pd.DataFrame()
    df_all_tributacion = (
        pd.concat(all_tributacion, ignore_index=True) if all_tributacion else pd.DataFrame()
    )
    df_all_competencias = (
        pd.concat(all_competencias, ignore_index=True) if all_competencias else pd.DataFrame()
    )
    return df_all_cursos, df_all_tributacion, df_all_competencias


def calcular_cobertura_por_semestre(
    df_tributacion: pd.DataFrame,
    carrera: str,
    df_competencias: pd.DataFrame | None = None,
    max_sem: int = 10,
) -> pd.DataFrame:
    """Return coverage matrix for one carrera.

    Columns: competencia_id, competencia_texto_corto, competencia_texto,
             semestre_1 … semestre_{max_sem}, cobertura_pct
    semestre_N = number of distinct courses in that semester that tribute.
    cobertura_pct = % of semesters 1-max_sem with at least 1 course.
    """
    df = df_tributacion[df_tributacion["carrera"] == carrera].copy()

    if df_competencias is not None and not df_competencias.empty:
        comp_df = df_competencias[df_competencias["carrera"] == carrera].drop_duplicates(
            subset=["competencia_id"]
        ).sort_values("competencia_id")
    elif df.empty:
        return pd.DataFrame()
    else:
        comp_df = (
            df[["competencia_id", "competencia_texto"]]
            .drop_duplicates()
            .sort_values("competencia_id")
        )

    has_texto_corto = "texto_corto" in comp_df.columns

    rows: list[dict] = []
    for _, comp in comp_df.iterrows():
        comp_id = comp["competencia_id"]
        texto = comp["competencia_texto"]
        texto_corto = comp["texto_corto"] if has_texto_corto else generar_texto_corto(texto)

        comp_trib = df[df["competencia_id"] == comp_id]
        # Only nivel-c courses count for coverage (full-mastery tribute)
        comp_trib_c = comp_trib[comp_trib["nivel"] == "c"] if "nivel" in comp_trib.columns else comp_trib
        sem_counts = comp_trib_c.groupby("semestre")["codigo_curso"].nunique()

        row: dict = {
            "competencia_id": comp_id,
            "competencia_texto_corto": texto_corto,
            "competencia_texto": texto,
        }
        cubiertos = 0
        for sem in range(1, max_sem + 1):
            count = int(sem_counts.get(sem, 0))
            row[f"semestre_{sem}"] = count
            if count > 0:
                cubiertos += 1

        row["cobertura_pct"] = round(cubiertos / max_sem * 100, 1)
        rows.append(row)

    return pd.DataFrame(rows)


def generar_resumen_tributacion(df_tributacion: pd.DataFrame) -> str:
    """Generate a compact text summary for the Taula system prompt."""
    if df_tributacion.empty:
        return "No hay datos de tributación disponibles."

    lines: list[str] = []
    for carrera in sorted(df_tributacion["carrera"].unique()):
        df_c = df_tributacion[df_tributacion["carrera"] == carrera]
        lines.append(f"Carrera {carrera}:")
        for codigo in sorted(df_c["codigo_curso"].unique()):
            df_curso = df_c[df_c["codigo_curso"] == codigo]
            nombre = df_curso["nombre_curso"].iloc[0]
            comp_ids = sorted(df_curso["competencia_id"].unique().tolist())
            sem = int(df_curso["semestre"].iloc[0])
            lines.append(
                f"  S{sem} {codigo} ({nombre[:40]}): PE [{','.join(str(c) for c in comp_ids)}]"
            )
    return "\n".join(lines)


if __name__ == "__main__":
    data_folder = Path(__file__).parent.parent / "data"
    print("Parseando matrices de tributación...\n")
    df_cursos, df_tributacion, df_competencias = parse_todas_las_matrices(data_folder)
    print(f"\nTotal cursos: {len(df_cursos)}")
    print(f"Total tributaciones: {len(df_tributacion)}")
    print("\nCobertura por carrera:")
    for carrera in ["ICA", "ICC", "ICE", "IOC", "ICI"]:
        carrera_cursos = df_cursos[df_cursos["carrera"] == carrera]
        max_sem = int(carrera_cursos["semestre"].max()) if not carrera_cursos.empty else 10
        df_cob = calcular_cobertura_por_semestre(df_tributacion, carrera, df_competencias, max_sem=max_sem)
        if not df_cob.empty:
            global_pct = round(df_cob["cobertura_pct"].mean(), 1)
            n_zero = int((df_cob["cobertura_pct"] == 0).sum())
            print(
                f"  {carrera}: {len(df_cob)} PE, semestres 1-{max_sem}, "
                f"cobertura {global_pct}%, {n_zero} sin tributación"
            )
    print("\nEjemplos texto_corto:")
    for carrera in ["ICA", "ICI"]:
        df_comp = df_competencias[df_competencias["carrera"] == carrera].head(3)
        for _, r in df_comp.iterrows():
            print(f"  [{carrera} PE{r['competencia_id']}] {r['texto_corto']}")
