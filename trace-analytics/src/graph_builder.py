import networkx as nx
import pandas as pd
from .data_loader import CARRERA_COLORS, CARRERA_NAMES

IMPORTANCE_WEIGHT = {"Alta": 3, "Media": 2, "Baja": 1}


def build_course_graph(general: pd.DataFrame, ra_links: pd.DataFrame) -> nx.DiGraph:
    G = nx.DiGraph()

    for _, row in general.iterrows():
        carrera = row["Carrera"]
        G.add_node(
            row["ID"],
            nombre=row["Nombre"],
            carrera=carrera,
            carrera_nombre=CARRERA_NAMES.get(carrera, carrera),
            color=CARRERA_COLORS.get(carrera, "#888888"),
        )

    edge_weights: dict[tuple, dict] = {}
    for _, row in ra_links.iterrows():
        src = row["ID_Prerrequisito"]
        dst = row["ID"]
        imp = row["Importancia"]
        key = (src, dst)
        if key not in edge_weights:
            edge_weights[key] = {"Alta": 0, "Media": 0, "Baja": 0, "total": 0}
        edge_weights[key][imp] = edge_weights[key].get(imp, 0) + 1
        edge_weights[key]["total"] += 1

    for (src, dst), counts in edge_weights.items():
        if src in G.nodes and dst in G.nodes:
            dominant = max(["Alta", "Media", "Baja"], key=lambda x: counts[x])
            G.add_edge(
                src, dst,
                weight=IMPORTANCE_WEIGHT[dominant],
                importancia=dominant,
                alta=counts["Alta"],
                media=counts["Media"],
                baja=counts["Baja"],
                total=counts["total"],
            )

    return G


def build_objective_graph(objectives: pd.DataFrame, ra_links: pd.DataFrame) -> nx.DiGraph:
    G = nx.DiGraph()

    for _, row in objectives.iterrows():
        G.add_node(
            row["ID_Objetivo"],
            curso_id=row["ID"],
            nombre_curso=row["Nombre"],
            objetivo=row["Objetivo"],
            carrera=row["Carrera"],
            color=CARRERA_COLORS.get(row["Carrera"], "#888888"),
        )

    for _, row in ra_links.iterrows():
        src = row["ID_Objetivo_Prerrequisito"]
        dst = row["ID_Objetivo"]
        imp = row["Importancia"]
        if src in G.nodes and dst in G.nodes:
            G.add_edge(src, dst, importancia=imp, weight=IMPORTANCE_WEIGHT.get(imp, 1))

    return G
