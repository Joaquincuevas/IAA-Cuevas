import plotly.graph_objects as go
import networkx as nx
import pandas as pd
from .data_loader import CARRERA_COLORS, CARRERA_NAMES

_PAPER  = "#FFFFFF"
_PLOT   = "#FFFFFF"
_GRID   = "#F3F4F6"
_TEXT   = "#111827"
_SOFT   = "#6B7280"
_ACCENT = "#1B2A4A"
_BORDER = "#E5E7EB"

IMPORTANCE_WIDTH   = {"Alta": 3, "Media": 2, "Baja": 1}
IMPORTANCE_OPACITY = {"Alta": 0.80, "Media": 0.50, "Baja": 0.25}


def build_course_graph_figure(G: nx.DiGraph, selected_carrera: str = "Todas") -> go.Figure:
    if selected_carrera != "Todas":
        nodes = [n for n, d in G.nodes(data=True) if d.get("carrera") == selected_carrera]
        G = G.subgraph(nodes).copy()

    pos = nx.spring_layout(G, seed=42, k=2.5)

    edge_traces = []
    for imp in ["Alta", "Media", "Baja"]:
        edges = [(u, v, d) for u, v, d in G.edges(data=True) if d.get("importancia") == imp]
        if not edges:
            continue
        x_lines, y_lines = [], []
        for u, v, _ in edges:
            x0, y0 = pos[u]
            x1, y1 = pos[v]
            x_lines += [x0, x1, None]
            y_lines += [y0, y1, None]
        edge_color = _ACCENT if imp == "Alta" else "#9CA3AF"
        edge_traces.append(go.Scatter(
            x=x_lines, y=y_lines,
            mode="lines",
            line=dict(width=IMPORTANCE_WIDTH[imp], color=edge_color),
            opacity=IMPORTANCE_OPACITY[imp],
            hoverinfo="none",
            name=f"Importancia {imp}",
            showlegend=True,
        ))

    node_x, node_y, node_text, node_hover, node_colors, node_sizes = [], [], [], [], [], []
    for node, data in G.nodes(data=True):
        x, y = pos[node]
        node_x.append(x)
        node_y.append(y)
        node_text.append(data.get("nombre", node))
        carrera = data.get("carrera", "")
        in_deg  = G.in_degree(node)
        out_deg = G.out_degree(node)
        node_hover.append(
            f"<b>{data.get('nombre', node)}</b><br>"
            f"ID: {node}<br>"
            f"Carrera: {data.get('carrera_nombre', carrera)}<br>"
            f"Links entrantes: {in_deg} | salientes: {out_deg}"
        )
        node_colors.append(CARRERA_COLORS.get(carrera, "#888888"))
        node_sizes.append(12 + in_deg * 2)

    node_trace = go.Scatter(
        x=node_x, y=node_y,
        mode="markers+text",
        text=node_text,
        textposition="top center",
        textfont=dict(size=8, color=_TEXT),
        hovertext=node_hover,
        hoverinfo="text",
        marker=dict(
            size=node_sizes,
            color=node_colors,
            line=dict(width=1.5, color="white"),
            opacity=0.92,
        ),
        customdata=list(G.nodes()),
        name="Cursos",
    )

    legend_traces = [
        go.Scatter(
            x=[None], y=[None], mode="markers",
            marker=dict(size=10, color=color),
            name=CARRERA_NAMES.get(code, code),
            showlegend=True,
        )
        for code, color in CARRERA_COLORS.items()
        if selected_carrera == "Todas" or code == selected_carrera
    ]

    fig = go.Figure(data=edge_traces + [node_trace] + legend_traces)
    fig.update_layout(
        paper_bgcolor=_PAPER,
        plot_bgcolor=_PLOT,
        font=dict(color=_TEXT),
        showlegend=True,
        legend=dict(bgcolor="rgba(247,248,250,0.95)", bordercolor=_BORDER, borderwidth=1),
        hovermode="closest",
        margin=dict(l=0, r=0, t=10, b=0),
        xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        height=650,
    )
    return fig


def build_coverage_bar_chart(carrera_summary: pd.DataFrame) -> go.Figure:
    df = carrera_summary.copy()
    df["Carrera_Label"] = df["Carrera"].map(CARRERA_NAMES).fillna(df["Carrera"])
    df = df.sort_values("Cobertura")

    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=df["Cobertura"] * 100,
        y=df["Carrera_Label"],
        orientation="h",
        marker=dict(color=_ACCENT, line=dict(color="white", width=0.5)),
        text=[f"{v:.1f}%" for v in df["Cobertura"] * 100],
        textposition="outside",
        textfont=dict(color=_TEXT, size=11),
        hovertemplate="<b>%{y}</b><br>Cobertura: %{x:.1f}%<extra></extra>",
    ))
    fig.update_layout(
        paper_bgcolor=_PAPER, plot_bgcolor=_PAPER,
        font=dict(color=_TEXT),
        xaxis=dict(title="Cobertura (%)", range=[0, 115], gridcolor=_GRID, color=_SOFT, showline=False),
        yaxis=dict(title="", color=_TEXT, showgrid=False),
        margin=dict(l=10, r=60, t=10, b=40),
        height=320,
        showlegend=False,
    )
    return fig


def build_coverage_scatter(df_course: pd.DataFrame) -> go.Figure:
    df = df_course.copy()

    fig = go.Figure()
    for carrera, grp in df.groupby("Carrera"):
        fig.add_trace(go.Scatter(
            x=grp["Total_Objetivos"],
            y=grp["Cobertura"] * 100,
            mode="markers",
            name=CARRERA_NAMES.get(carrera, carrera),
            marker=dict(
                size=9,
                color=CARRERA_COLORS.get(carrera, "#888"),
                line=dict(color="white", width=1),
                opacity=0.85,
            ),
            hovertemplate=(
                "<b>%{customdata[0]}</b><br>"
                "Total objetivos: %{x}<br>"
                "Cobertura: %{y:.1f}%<extra></extra>"
            ),
            customdata=grp[["ID"]].values,
        ))
    fig.update_layout(
        paper_bgcolor=_PAPER, plot_bgcolor=_PAPER,
        font=dict(color=_TEXT),
        xaxis=dict(title="Total Objetivos", gridcolor=_GRID, color=_SOFT, showline=False),
        yaxis=dict(title="Cobertura (%)", gridcolor=_GRID, color=_SOFT, showline=False),
        legend=dict(bgcolor="rgba(247,248,250,0.95)", bordercolor=_BORDER, borderwidth=1),
        margin=dict(l=10, r=10, t=10, b=40),
        height=380,
    )
    return fig


def build_redundancy_chart(df: pd.DataFrame, top_n: int = 20) -> go.Figure:
    df = df.head(top_n).copy()
    df["Label"] = df["ID_Objetivo"] + " — " + df["Curso_Nombre"].fillna("")
    df = df.sort_values("Cursos_Demandantes")

    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=df["Cursos_Demandantes"],
        y=df["Label"],
        orientation="h",
        marker=dict(color=_ACCENT, line=dict(color="white", width=0.5)),
        text=df["Cursos_Demandantes"],
        textposition="outside",
        textfont=dict(color=_TEXT, size=11),
        hovertemplate="<b>%{y}</b><br>Cursos demandantes: %{x}<extra></extra>",
    ))
    fig.update_layout(
        paper_bgcolor=_PAPER, plot_bgcolor=_PAPER,
        font=dict(color=_TEXT),
        xaxis=dict(title="Nº cursos que lo demandan", gridcolor=_GRID, color=_SOFT, showline=False),
        yaxis=dict(title="", tickfont=dict(size=10, color=_TEXT), showgrid=False),
        margin=dict(l=10, r=60, t=10, b=40),
        height=max(380, top_n * 28),
        showlegend=False,
    )
    return fig


def build_adjacency_bar_chart(df_adj: pd.DataFrame, top_n: int = 15) -> go.Figure:
    df = df_adj.nlargest(top_n, "Total conexiones").copy()
    df = df.sort_values("Total conexiones")
    df["Label"] = df["ID"] + " — " + df["Nombre"]

    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=df["Total conexiones"],
        y=df["Label"],
        orientation="h",
        marker=dict(color=_ACCENT, line=dict(color="white", width=0.5)),
        text=df["Total conexiones"],
        textposition="outside",
        textfont=dict(color=_TEXT, size=11),
        hovertemplate=(
            "<b>%{customdata[0]}</b><br>"
            "Recibe de: %{customdata[1]} cursos<br>"
            "Alimenta a: %{customdata[2]} cursos<br>"
            "Total: %{x}<extra></extra>"
        ),
        customdata=df[["ID", "Recibe de (in)", "Alimenta a (out)"]].values,
    ))
    fig.update_layout(
        paper_bgcolor=_PAPER, plot_bgcolor=_PAPER,
        font=dict(color=_TEXT),
        xaxis=dict(
            title="Total conexiones",
            gridcolor=_GRID,
            color=_SOFT,
            showline=False,
            zeroline=False,
        ),
        yaxis=dict(title="", tickfont=dict(size=10, color=_TEXT), showgrid=False),
        margin=dict(l=10, r=60, t=10, b=40),
        height=max(380, top_n * 34),
        showlegend=False,
    )
    return fig
