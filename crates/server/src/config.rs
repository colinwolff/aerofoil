//! Server configuration and bootstrap environment variables for web radar clients.

/// Configuration payload delivered via `GET /api/config`.
#[derive(Debug, Clone)]
pub struct ServerWebConfig {
    pub receiver_lat: f64,
    pub receiver_lon: f64,
    pub receiver_name: String,
    pub default_basemap: String,
    pub carto_key: String,
    pub mapbox_token: String,
    pub custom_tile_url: String,
    pub units: String,
    pub weather_enabled: bool,
    pub airspace_enabled: bool,
}

impl Default for ServerWebConfig {
    fn default() -> Self {
        Self {
            receiver_lat: 52.3676,
            receiver_lon: 4.9041,
            receiver_name: "Aerofoil Station".to_string(),
            default_basemap: "osm_dark".to_string(),
            carto_key: String::new(),
            mapbox_token: String::new(),
            custom_tile_url: String::new(),
            units: "nautical".to_string(),
            weather_enabled: false,
            airspace_enabled: true,
        }
    }
}

impl ServerWebConfig {
    /// Resolves configuration from environment variables, falling back to defaults.
    #[must_use]
    pub fn from_env() -> Self {
        let def = Self::default();

        let receiver_lat = std::env::var("AEROFOIL_RECEIVER_LAT")
            .ok()
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(def.receiver_lat);

        let receiver_lon = std::env::var("AEROFOIL_RECEIVER_LON")
            .ok()
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(def.receiver_lon);

        let receiver_name = std::env::var("AEROFOIL_RECEIVER_NAME").unwrap_or(def.receiver_name);

        let default_basemap =
            std::env::var("AEROFOIL_DEFAULT_BASEMAP").unwrap_or(def.default_basemap);

        let carto_key = std::env::var("AEROFOIL_CARTO_KEY").unwrap_or(def.carto_key);

        let mapbox_token = std::env::var("AEROFOIL_MAPBOX_TOKEN").unwrap_or(def.mapbox_token);

        let custom_tile_url =
            std::env::var("AEROFOIL_CUSTOM_TILE_URL").unwrap_or(def.custom_tile_url);

        let units = std::env::var("AEROFOIL_UNITS").unwrap_or(def.units);

        let weather_enabled = std::env::var("AEROFOIL_WEATHER_ENABLED")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(def.weather_enabled);

        let airspace_enabled = std::env::var("AEROFOIL_AIRSPACE_ENABLED")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(def.airspace_enabled);

        Self {
            receiver_lat,
            receiver_lon,
            receiver_name,
            default_basemap,
            carto_key,
            mapbox_token,
            custom_tile_url,
            units,
            weather_enabled,
            airspace_enabled,
        }
    }

    /// Serializes configuration into a JSON string.
    #[must_use]
    pub fn to_json(&self) -> String {
        format!(
            concat!(
                "{{\"receiverLat\":{:.6},\"receiverLon\":{:.6},\"receiverName\":{:?},",
                "\"defaultBasemap\":{:?},\"cartoKey\":{:?},\"mapboxToken\":{:?},",
                "\"customTileUrl\":{:?},\"ringIntervals\":[10,25,50,100],\"units\":{:?},",
                "\"weatherEnabled\":{},\"airspaceEnabled\":{}}}\n"
            ),
            self.receiver_lat,
            self.receiver_lon,
            self.receiver_name,
            self.default_basemap,
            self.carto_key,
            self.mapbox_token,
            self.custom_tile_url,
            self.units,
            self.weather_enabled,
            self.airspace_enabled
        )
    }
}
