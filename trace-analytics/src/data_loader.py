import pandas as pd
from pathlib import Path
import streamlit as st
import os

DATA_PATH = Path(os.environ.get("DATA_PATH", str(Path(__file__).parent.parent / "data" / "RA_UandesFunctional.xlsx")))

CARRERA_NAMES = {
    "IOC": "Ing. Obras Civiles",
    "ICI": "Ing. Civil Industrial",
    "ING": "Ing. General",
    "ICE": "Ing. Civil Eléctrica",
    "ICC": "Ing. Civil Computación",
    "ICA": "Ing. Civil Ambiental",
}

CARRERA_COLORS = {
    "IOC": "#1B2A4A",
    "ICI": "#243B6E",
    "ING": "#2F5292",
    "ICE": "#3B6DC1",
    "ICC": "#4A85D4",
    "ICA": "#6B8EB8",
}


@st.cache_data
def load_data() -> dict[str, pd.DataFrame]:
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"No se encontró el Excel en {DATA_PATH}. Monta el archivo en /data/RA_UandesFunctional.xlsx o define DATA_PATH."
        )

    xl = pd.ExcelFile(DATA_PATH)

    general = xl.parse("general").dropna(subset=["ID"])
    general["ID"] = general["ID"].str.strip()
    general["Nombre"] = general["Nombre"].str.strip()
    general["Carrera"] = general["ID"].str.split("_").str[0]

    requirements = xl.parse("requirements").dropna(subset=["ID", "ID_Requisito"])
    requirements["ID"] = requirements["ID"].str.strip()
    requirements["ID_Requisito"] = requirements["ID_Requisito"].str.strip()

    objectives = xl.parse("objectives").dropna(subset=["ID", "ID_Objetivo"])
    objectives["ID"] = objectives["ID"].str.strip()
    objectives["ID_Objetivo"] = objectives["ID_Objetivo"].str.strip()
    objectives["Carrera"] = objectives["ID"].str.split("_").str[0]

    ra_links = xl.parse("RA_Links").dropna(subset=["ID", "ID_Objetivo", "ID_Prerrequisito"])
    ra_links["ID"] = ra_links["ID"].str.strip()
    ra_links["ID_Objetivo"] = ra_links["ID_Objetivo"].str.strip()
    ra_links["ID_Prerrequisito"] = ra_links["ID_Prerrequisito"].str.strip()
    ra_links["ID_Objetivo_Prerrequisito"] = ra_links["ID_Objetivo_Prerrequisito"].str.strip()
    ra_links["Importancia"] = ra_links["Importancia"].fillna("Baja").str.strip()

    return {
        "general": general,
        "requirements": requirements,
        "objectives": objectives,
        "ra_links": ra_links,
    }
