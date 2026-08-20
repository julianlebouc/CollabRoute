import pandas as pd
import ast
import re
import json
import os
import argparse

def extract_countries(nodes_csv_path: str, output_json_path: str):
    """Extrait les pays uniques de chart_hits dans nodes.csv et les sauvegarde dans un fichier JSON."""
    print(f"Loading {nodes_csv_path}...")
    try:
        df = pd.read_csv(nodes_csv_path)
    except Exception as e:
        print(f"Error loading nodes.csv: {e}")
        return
        
    countries = set()
    print("Extracting countries from chart_hits...")
    for hits_str in df['chart_hits'].dropna():
        try:
            hits_list = ast.literal_eval(hits_str)
            if isinstance(hits_list, list):
                for hit in hits_list:
                    match = re.match(r'^([a-z]+)\s*\(', str(hit))
                    if match:
                        countries.add(match.group(1))
        except (ValueError, SyntaxError):
            pass
            
    countries_list = sorted(list(countries))
    print(f"Found {len(countries_list)} unique countries.")
    
    # S'assure que le dossier de sortie existe
    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
    
    with open(output_json_path, 'w') as f:
        json.dump(countries_list, f)
    print(f"Saved to {output_json_path}.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract countries from CollabRoute nodes.")
    parser.add_argument("--nodes", default="data/nodes.csv", help="Path to nodes.csv")
    parser.add_argument("--output", default="data/countries.json", help="Path to output countries.json")
    args = parser.parse_args()
    
    extract_countries(args.nodes, args.output)
