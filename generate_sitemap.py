#!/usr/bin/env python3
# generate_sitemap.py - Generiert sitemap.xml für makerspac.es

import json
import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime
import re

def load_makerspaces(json_file='locations.json'):
    """Lädt die Makerspace-Daten aus JSON"""
    with open(json_file, 'r', encoding='utf-8') as f:
        return json.load(f)

def find_all_countries(data):
    """Findet alle einzigartigen Länder in den Daten"""
    countries = set()
    
    for location in data:
        country = location.get('loc', {}).get('country')
        if country and country != 'COUNTRY_COUNTRY':
            countries.add(country)
    
    return sorted(list(countries))

def country_to_slug(country):
    """Konvertiert Länder-Namen zu URL-Slug"""
    slug = country.lower()
    # Umlaute ersetzen
    slug = slug.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    # Leerzeichen zu Bindestrichen
    slug = re.sub(r'\s+', '-', slug)
    # Nur alphanumerische Zeichen und Bindestriche
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    return slug

def city_to_slug(city):
    """Konvertiert Stadt-Namen zu URL-Slug"""
    slug = city.lower()
    # Umlaute ersetzen
    slug = slug.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    # Leerzeichen zu Bindestrichen
    slug = re.sub(r'\s+', '-', slug)
    # Nur alphanumerische Zeichen und Bindestriche
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    return slug

def get_city_url_slug(city, reserved_routes):
    """
    Generiert URL-Slug für Stadt und prüft auf Konflikte.
    Fügt 'city-' prefix nur bei Konflikten hinzu.
    """
    slug = city_to_slug(city)
    
    # Prüfe ob Slug mit reservierten Routes kollidiert
    if slug in reserved_routes:
        return f'city-{slug}'
    else:
        return slug

# def find_cities_with_multiple_spaces(data):
#     """Findet alle Städte mit 2+ Makerspaces"""
#     city_count = {}
    
#     for location in data:
#         city = location.get('loc', {}).get('city')
#         if city and city != 'CITY_CITY':
#             city_count[city] = city_count.get(city, 0) + 1
    
#     return {city: count for city, count in city_count.items() if count >= 2}

def find_all_cities_for_sitemap(data):
    """Findet alle Städte mit 1+ Makerspaces für die Sitemap"""
    city_count = {}
    
    for location in data:
        city = location.get('loc', {}).get('city')
        if city and city != 'CITY_CITY':
            city_count[city] = city_count.get(city, 0) + 1
    
    # Rückgabe aller Städte, bei denen der Zähler >= 1 ist (also alle gefundenen)
    return {city: count for city, count in city_count.items() if count >= 1}

def create_sitemap(base_url='https://makerspac.es'):
    """Erstellt die komplette sitemap.xml"""
    
    # Lade Makerspace-Daten
    data = load_makerspaces()
    cities = find_all_cities_for_sitemap(data),
    countries = find_all_countries(data)
    
    # Erstelle Root Element
    urlset = ET.Element('urlset')
    urlset.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')
    
    # Aktuelles Datum für lastmod
    today = datetime.now().strftime('%Y-%m-%d')
    
    # Erstelle reservierte Routes dynamisch (Länder + Styles)
    reserved_routes = set()
    
    # Füge Länder-Slugs zu reservierten Routes hinzu
    for country in countries:
        reserved_routes.add(country_to_slug(country))
    
    # Füge Style-Routes hinzu
    reserved_routes.update(['for-all', 'for-students', 'for-youth', 'commercial', 'open', 'closed'])
    
    # URLs mit Prioritäten
    urls = [
        # Hauptseite - höchste Priorität
        {'loc': '', 'priority': '1.0', 'changefreq': 'daily'},
    ]
    
    # Länder - dynamisch aus Daten (sehr hohe Priorität)
    for country in countries:
        slug = country_to_slug(country)
        urls.append({
            'loc': slug,
            'priority': '0.9',
            'changefreq': 'weekly'
        })
    
    # Zielgruppen - hohe Priorität
    urls.extend([
        {'loc': 'for-all', 'priority': '0.8', 'changefreq': 'weekly'},
        {'loc': 'for-students', 'priority': '0.8', 'changefreq': 'weekly'},
        {'loc': 'for-youth', 'priority': '0.8', 'changefreq': 'weekly'},
        {'loc': 'commercial', 'priority': '0.7', 'changefreq': 'weekly'},
        {'loc': 'open', 'priority': '0.7', 'changefreq': 'daily'},
        {'loc': 'closed', 'priority': '0.6', 'changefreq': 'daily'},
    ])
    
    # Füge Städte hinzu (mit intelligentem Konflikt-Management)
    conflicts_found = []
    for city, count in sorted(cities.items(), key=lambda x: x[1], reverse=True):
        slug = get_city_url_slug(city, reserved_routes)
        
        # Logge Konflikte
        if slug.startswith('city-'):
            conflicts_found.append(f"{city} -> {slug}")
        
        # Städte mit mehr Spaces bekommen höhere Priorität
        priority = min(0.85, 0.7 + (count * 0.05))
        urls.append({
            'loc': slug,
            'priority': f'{priority:.2f}',
            'changefreq': 'weekly'
        })
    
    if conflicts_found:
        print("\n⚠️  Conflicts detected (using 'city-' prefix):")
        for conflict in conflicts_found:
            print(f"  - {conflict}")
    
    # Erstelle URL-Einträge
    for url_data in urls:
        url_elem = ET.SubElement(urlset, 'url')
        
        # Location
        loc = ET.SubElement(url_elem, 'loc')
         # ✨ NEU: HASH-MODE ANPASSUNG
        # Wenn der loc-Wert leer ist (Startseite), verwende nur die base_url
        if not url_data['loc']:
            final_url = base_url
        # Ansonsten füge den Hash-Präfix hinzu
        else:
            final_url = f"{base_url}/#/{url_data['loc']}" 
            
        loc.text = final_url
        
        # Last Modified
        lastmod = ET.SubElement(url_elem, 'lastmod')
        lastmod.text = today
        
        # Change Frequency
        changefreq = ET.SubElement(url_elem, 'changefreq')
        changefreq.text = url_data['changefreq']
        
        # Priority
        priority = ET.SubElement(url_elem, 'priority')
        priority.text = url_data['priority']
    
    # Formatiere XML schön
    xml_string = ET.tostring(urlset, encoding='utf-8')
    parsed = minidom.parseString(xml_string)
    pretty_xml = parsed.toprettyxml(indent='  ', encoding='utf-8').decode('utf-8')
    
    # Entferne leere Zeilen
    lines = [line for line in pretty_xml.split('\n') if line.strip()]
    pretty_xml = '\n'.join(lines)
    
    return pretty_xml

def save_sitemap(xml_content, filename='sitemap.xml'):
    """Speichert die Sitemap in eine Datei"""
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(xml_content)

def print_stats(data):
    """Gibt Statistiken über die Sitemap aus"""
    cities = find_all_cities_for_sitemap(data),
    countries = find_all_countries(data)
    
    print("\n=== Sitemap Statistiken ===")
    print(f"Gesamt Makerspaces: {len(data)}")
    print(f"Länder: {len(countries)}")
    print(f"  {', '.join(countries)}")
    print(f"Städte mit 2+ Spaces: {len(cities)}")
    print(f"\nTop 10 Städte:")
    for city, count in sorted(cities.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {city}: {count} Spaces")
    print(f"\nGesamt URLs in Sitemap: {6 + len(countries) + len(cities)}")  # 6 = Styles + Hauptseite

if __name__ == '__main__':
    print("Generiere sitemap.xml für makerspac.es...")
    
    try:
        # Lade Daten
        data = load_makerspaces()
        
        # Erstelle Sitemap
        xml_content = create_sitemap()
        
        # Speichere Sitemap
        save_sitemap(xml_content)
        
        print("✓ sitemap.xml erfolgreich erstellt!")
        
        # Zeige Statistiken
        print_stats(data)
        
        print("\nNächste Schritte:")
        print("1. Lade sitemap.xml auf deinen Server hoch")
        print("2. Reiche sie bei Google Search Console ein:")
        print("   https://search.google.com/search-console")
        print("3. Teste die Sitemap:")
        print("   https://www.xml-sitemaps.com/validate-xml-sitemap.html")
        
    except FileNotFoundError:
        print("❌ Fehler: locations.json nicht gefunden!")
        print("Stelle sicher, dass die JSON-Datei im selben Verzeichnis liegt.")
    except json.JSONDecodeError as e:
        print(f"❌ Fehler beim Parsen der JSON-Datei: {e}")
    except Exception as e:
        print(f"❌ Unerwarteter Fehler: {e}")