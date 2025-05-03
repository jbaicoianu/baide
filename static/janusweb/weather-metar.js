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

        const tokens = metar.trim().split(/\s+/);
        let state = 'START';
        let metarData = {
            stationId: null,
            observationTime: null,
            windDirDegrees: null,
            windSpeedKts: null,
            windGustKts: null,
            visibilityStatuteMi: null,
            skyConditions: [],
            temperatureC: null,
            dewPointC: null,
            altimeterInHg: null,
            remarks: ''
        };

        for (let token of tokens) {
            console.log(' -', token, state);
            switch (state) {
                case 'START':
                    // Station ID
                    if (/^[A-Z]{4}$/.test(token)) {
                        metarData.stationId = token;
                        state = 'OBS_TIME';
                    }
                    break;
                case 'OBS_TIME':
                    // Observation Time
                    if (/^\d{6}Z$/.test(token)) {
                        metarData.observationTime = this.parseObservationTime(token);
                        state = 'WIND';
                    }
                    break;
                case 'WIND':
                    // Wind
                    if (/^\d{3}\d{2,3}(G\d{2})?KT$/.test(token)) {
                        const windRegex = /^(\d{3})(\d{2,3})(G(\d{2}))?KT$/;
                        const windMatch = token.match(windRegex);
                        metarData.windDirDegrees = windMatch[1] !== '000' ? parseInt(windMatch[1], 10) : null;
                        metarData.windSpeedKts = parseInt(windMatch[2], 10);
                        metarData.windGustKts = windMatch[4] ? parseInt(windMatch[4], 10) : null;
                        state = 'VISIBILITY';
                    }
                    break;
                case 'VISIBILITY':
                    // Visibility
                    if (/^\d+SM$/.test(token)) {
                        metarData.visibilityStatuteMi = parseFloat(token.replace('SM', ''));
                        state = 'SKY_CONDITIONS';
                    }
                    break;
                case 'SKY_CONDITIONS':
                    // Multiple Sky Conditions
                    if (/^(FEW|SCT|BKN|OVC)\d{3}$/.test(token)) {
                        const skyRegex = /^(FEW|SCT|BKN|OVC)(\d{3})$/;
                        const skyMatch = token.match(skyRegex);
                        metarData.skyConditions.push({
                            skyCover: skyMatch[1],
                            cloudBaseFtAgl: parseInt(skyMatch[2], 10) * 100
                        });
                    } else {
                        state = 'TEMPERATURE';
                        // Fall through to handle temperature without sky conditions
                        // No break
                        // Continue to next case
                        continue;
                    }
                    break;
                case 'TEMPERATURE':
                    // Temperature and Dew Point
                    if (/^M?\d{2}\/M?\d{2}$/.test(token)) {
                        const tempDew = token.split('/');
                        console.log('ehhhh', tempDew, token);
                        metarData.temperatureC = tempDew[0].startsWith('M') ? -parseInt(tempDew[0].slice(1), 10) : parseInt(tempDew[0], 10);
                        metarData.dewPointC = tempDew[1].startsWith('M') ? -parseInt(tempDew[1].slice(1), 10) : parseInt(tempDew[1], 10);
                        state = 'ALTIMETER';
                    }
                    break;
                case 'ALTIMETER':
                    // Altimeter
                    if (/^A\d{4}$/.test(token)) {
                        metarData.altimeterInHg = parseInt(token.slice(1), 10) / 100;
                        state = 'REMARKS';
                    }
                    break;
                case 'REMARKS':
                    // Remarks
                    if (token === 'RMK') {
                        metarData.remarks = metar.substring(metar.indexOf('RMK'));
                        state = 'END';
                    }
                    break;
                case 'END':
                    // Do nothing
                    break;
                default:
                    break;
            }
        }

        return metarData;
    },

    parseObservationTime(observationTime) {
        // Example input: "220530Z"
        const day = parseInt(observationTime.slice(0, 2), 10);
        const hour = parseInt(observationTime.slice(2, 4), 10);
        const minute = parseInt(observationTime.slice(4, 6), 10);
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();
        return new Date(Date.UTC(year, month, day, hour, minute));
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