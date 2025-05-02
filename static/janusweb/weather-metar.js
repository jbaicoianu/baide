room.registerElement('weather-metar', {
    metarData: {},
    gps: '',
    stationid: '',

    async getWeatherByGPS(lat, lon) {
        try {
            const station = await this.findClosestStation(lat, lon);
            if (!station) {
                throw new Error('No weather station found nearby.');
            }
            const metar = await this.fetchMetar(station.id);
            this.metarData = this.parseMetar(metar);
            return this.metarData;
        } catch (error) {
            console.error('Error fetching METAR data:', error);
            return null;
        }
    },

    async getWeatherByStationId(stationId) {
        try {
            const metar = await this.fetchMetar(stationId);
            if (!metar) {
                throw new Error('No METAR data found for the specified station.');
            }
            this.metarData = this.parseMetar(metar);
            return this.metarData;
        } catch (error) {
            console.error('Error fetching METAR data:', error);
            return null;
        }
    },

    async findClosestStation(lat, lon) {
        const response = await fetch(`/api/data/stations?lat=${lat}&lon=${lon}&radius=50&mostRecent=true`);
        if (!response.ok) {
            console.error('Failed to fetch stations data:', response.statusText);
            return null;
        }
        const data = await response.json();
        if (!data.stations || data.stations.length === 0) return null;
        const station = data.stations[0];
        return {
            id: station.stationId,
            name: station.name,
            latitude: parseFloat(station.latitude),
            longitude: parseFloat(station.longitude)
        };
    },

    async fetchMetar(stationId) {
        const response = await fetch(`/api/data/metar?stationId=${stationId}&hoursBeforeNow=2&mostRecent=true`);
        if (!response.ok) {
            console.error('Failed to fetch METAR data:', response.statusText);
            return null;
        }
        const data = await response.json();
        if (!data.metar) return null;
        return data.metar;
    },

    parseMetar(metar) {
        if (!metar) return null;
        return {
            stationId: metar.station_id,
            observationTime: metar.observation_time,
            windDirDegrees: metar.wind_dir_degrees,
            windSpeedKts: metar.wind_speed_kt,
            visibilityStatuteMi: metar.visibility_statute_mi,
            skyConditions: metar.sky_condition.map(cond => ({
                skyCover: cond.sky_cover,
                cloudBaseFtAgl: cond.cloud_base_ft_agl
            })),
            temperatureC: metar.temp_c,
            dewPointC: metar.dewpoint_c,
            altimeterInHg: metar.altim_in_hg,
            flightRules: metar.flight_rules,
            wxString: metar.wx_string
        };
    },

    create() {
        if (this.stationid) {
            this.getWeatherByStationId(this.stationid).then(weather => {
                if (weather) {
                    this.updateRoomWeather(weather);
                }
            });
        } else if (this.gps) {
            const [latStr, lonStr] = this.gps.split(' ');
            const lat = parseFloat(latStr);
            const lon = parseFloat(lonStr);
            if (!isNaN(lat) && !isNaN(lon)) {
                this.getWeatherByGPS(lat, lon).then(weather => {
                    if (weather) {
                        this.updateRoomWeather(weather);
                    }
                });
            } else {
                console.error('Invalid GPS format. Expected "<lat> <lon>".');
            }
        }
        // Initialization code if needed
    },

    updateRoomWeather(weather) {
        // Implementation for updating the room with the weather data
        console.log('Room weather updated:', weather);
        // Add your update logic here
    },

    update(dt) {
        // Per-frame update logic if needed
    }
});