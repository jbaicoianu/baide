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
        const response = await fetch(`https://p.janusxr.org/https://aviationweather.gov/data/stations?lat=${lat}&lon=${lon}&radius=50&mostRecent=true`);
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
        const response = await fetch(`https://p.janusxr.org/https://aviationweather.gov/api/data/metar?ids=${stationId}&format=raw&taf=false`);
        if (!response.ok) {
            console.error('Failed to fetch METAR data:', response.statusText);
            return null;
        }
        const metar = await response.text();
        return metar;
    },

    parseMetar(metar) {
        if (!metar) return null;
        const metarRegex = /^([A-Z]{4})\s+(\d{6})Z\s+([\dG]*\d{3}KT)\s+/;
        const match = metar.match(metarRegex);
        if (!match) {
            console.error('METAR format not recognized:', metar);
            return null;
        }

        const [
            ,
            stationId,
            observationTime,
            wind,
            visibility,
            skyConditionsRaw,
            temperature,
            dewPoint,
            altimeter,
            remarks
        ] = match;

        // Parse wind
        const windRegex = /(\d{3})(\d{2})(G(\d{2}))?KT/;
        const windMatch = wind.match(windRegex);
        const windDirDegrees = windMatch[1] !== '000' ? parseInt(windMatch[1], 10) : null;
        const windSpeedKts = parseInt(windMatch[2], 10);
        const windGustKts = windMatch[4] ? parseInt(windMatch[4], 10) : null;

        // Parse sky conditions
        const skyConditions = [];
        const skyRegex = /(FEW|SCT|BKN|OVC)(\d{3})/g;
        let skyMatchIter;
        while ((skyMatchIter = skyRegex.exec(skyConditionsRaw)) !== null) {
            skyConditions.push({
                skyCover: skyMatchIter[1],
                cloudBaseFtAgl: parseInt(skyMatchIter[2], 10) * 100
            });
        }

        return {
            stationId,
            observationTime: this.parseObservationTime(observationTime),
            windDirDegrees,
            windSpeedKts,
            windGustKts,
            visibilityStatuteMi: parseFloat(visibility.replace('SM', '')),
            skyConditions,
            temperatureC: parseInt(temperature, 10),
            dewPointC: parseInt(dewPoint, 10),
            altimeterInHg: parseInt(altimeter, 10) / 100,
            remarks
        };
    },

    parseObservationTime(observationTime) {
        const day = parseInt(observationTime.slice(0, 2), 10);
        const hour = parseInt(observationTime.slice(2, 4), 10);
        const minute = parseInt(observationTime.slice(4, 6), 10);
        return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), day, hour, minute));
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