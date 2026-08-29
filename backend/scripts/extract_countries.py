import pandas as pd
import json
import os
import argparse


def extract_countries(nodes_csv_path: str, output_json_path: str):
    """Extrait les pays uniques de la colonne 'country' dans nodes.csv et les sauvegarde dans un fichier JSON."""
    print(f"Loading {nodes_csv_path}...")
    try:
        df = pd.read_csv(nodes_csv_path)
    except Exception as e:
        print(f"Error loading nodes.csv: {e}")
        return

    countries_list = sorted(df['country'].dropna().str.strip().str.lower().unique().tolist())
    print(f"Found {len(countries_list)} unique countries.")

    os.makedirs(os.path.dirname(os.path.abspath(output_json_path)), exist_ok=True)

    with open(output_json_path, 'w') as f:
        json.dump(countries_list, f)
    print(f"Saved to {output_json_path}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract countries from CollabRoute nodes.")
    parser.add_argument("--nodes", default="data/nodes.csv", help="Path to nodes.csv")
    parser.add_argument("--output", default="data/countries.json", help="Path to output countries.json")
    args = parser.parse_args()

    extract_countries(args.nodes, args.output)
