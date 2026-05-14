import pandas as pd
from .data_loader import CARRERA_NAMES


def compute_coverage(objectives: pd.DataFrame, ra_links: pd.DataFrame) -> dict:
    """
    KPI 1 — Cobertura: porcentaje de objetivos de un curso que tienen al menos
    un link de importancia Alta hacia un curso posterior (están siendo 'recibidos').
    """
    alta_links = ra_links[ra_links["Importancia"] == "Alta"]
    covered_objectives = set(alta_links["ID_Objetivo_Prerrequisito"].unique())

    obj_per_course = objectives.groupby("ID")["ID_Objetivo"].apply(list).reset_index()
    obj_per_course.columns = ["ID", "objetivos"]
    obj_per_course["Carrera"] = obj_per_course["ID"].str.split("_").str[0]

    rows = []
    for _, row in obj_per_course.iterrows():
        total = len(row["objetivos"])
        covered = sum(1 for o in row["objetivos"] if o in covered_objectives)
        rows.append({
            "ID": row["ID"],
            "Carrera": row["Carrera"],
            "Carrera_Nombre": CARRERA_NAMES.get(row["Carrera"], row["Carrera"]),
            "Total_Objetivos": total,
            "Objetivos_Cubiertos": covered,
            "Cobertura": covered / total if total > 0 else 0.0,
        })

    df_coverage = pd.DataFrame(rows).sort_values("Cobertura", ascending=False)

    carrera_summary = (
        df_coverage.groupby(["Carrera", "Carrera_Nombre"])
        .agg(
            Total_Objetivos=("Total_Objetivos", "sum"),
            Objetivos_Cubiertos=("Objetivos_Cubiertos", "sum"),
        )
        .reset_index()
    )
    carrera_summary["Cobertura"] = (
        carrera_summary["Objetivos_Cubiertos"] / carrera_summary["Total_Objetivos"]
    )
    carrera_summary = carrera_summary.sort_values("Cobertura", ascending=False)

    overall = df_coverage["Objetivos_Cubiertos"].sum() / df_coverage["Total_Objetivos"].sum()

    return {
        "by_course": df_coverage,
        "by_carrera": carrera_summary,
        "overall": overall,
    }


def compute_redundancy(objectives: pd.DataFrame, ra_links: pd.DataFrame, min_count: int = 3) -> dict:
    """
    KPI 2 — Redundancia: objetivos que aparecen como prerrequisito en 3+ cursos distintos.
    Estos son los objetivos más críticos/demandados.
    """
    link_courses = ra_links[["ID_Objetivo_Prerrequisito", "ID"]].drop_duplicates()
    counts = (
        link_courses.groupby("ID_Objetivo_Prerrequisito")["ID"]
        .nunique()
        .reset_index()
    )
    counts.columns = ["ID_Objetivo", "Cursos_Demandantes"]
    counts = counts[counts["Cursos_Demandantes"] >= min_count].sort_values(
        "Cursos_Demandantes", ascending=False
    )

    obj_info = objectives[["ID_Objetivo", "ID", "Nombre", "Objetivo"]].copy()
    obj_info.columns = ["ID_Objetivo", "Curso_ID", "Curso_Nombre", "Descripcion_Objetivo"]

    result = counts.merge(obj_info, on="ID_Objetivo", how="left")

    demanding_courses = (
        link_courses.groupby("ID_Objetivo_Prerrequisito")["ID"]
        .apply(list)
        .reset_index()
    )
    demanding_courses.columns = ["ID_Objetivo", "Cursos_Lista"]
    result = result.merge(demanding_courses, on="ID_Objetivo", how="left")
    result["Carrera"] = result["Curso_ID"].str.split("_").str[0]

    importancia_counts = (
        ra_links.groupby("ID_Objetivo_Prerrequisito")["Importancia"]
        .value_counts()
        .unstack(fill_value=0)
        .reset_index()
    )
    importancia_counts.columns.name = None
    importancia_counts = importancia_counts.rename(columns={"ID_Objetivo_Prerrequisito": "ID_Objetivo"})
    for col in ["Alta", "Media", "Baja"]:
        if col not in importancia_counts.columns:
            importancia_counts[col] = 0

    result = result.merge(importancia_counts[["ID_Objetivo", "Alta", "Media", "Baja"]], on="ID_Objetivo", how="left")

    all_demand = (
        link_courses.groupby("ID_Objetivo_Prerrequisito")["ID"]
        .nunique()
        .reset_index()
    )
    all_demand.columns = ["ID_Objetivo", "Cursos_Demandantes"]
    all_demand = all_demand.sort_values("Cursos_Demandantes", ascending=False)
    all_demand = all_demand.merge(obj_info, on="ID_Objetivo", how="left")

    return {
        "high_demand": result,
        "all_demand": all_demand,
        "min_count": min_count,
    }
