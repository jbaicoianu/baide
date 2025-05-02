class WeatherMetar extends HTMLElement {
    constructor() {
        super();
        this.metarData = {};
    }

    async getWeather(lat, lon) {
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
    }

    async findClosestStation(lat, lon) {
        const response = await fetch(`https://aviationweather.gov/adds/dataserver_current/httpparam?datasource=stations&requestType=retrieve&format=XML&latitude=${lat}&longitude=${lon}&radius=50&mostRecent=true`);
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "application/xml");
        const stations = xml.getElementsByTagName('station');
        if (stations.length === 0) return null;
        const station = stations[0];
        return {
            id: station.getElementsByTagName('stationId')[0].textContent,
            name: station.getElementsByTagName('name')[0].textContent,
            latitude: parseFloat(station.getElementsByTagName('latitude')[0].textContent),
            longitude: parseFloat(station.getElementsByTagName('longitude')[0].textContent)
        };
    }

    async fetchMetar(stationId) {
        const response = await fetch(`https://aviationweather.gov/adds/dataserver_current/httpparam?datasource=metars&requestType=retrieve&format=XML&stationString=${stationId}&hoursBeforeNow=2&mostRecent=true`);
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "application/xml");
        const metars = xml.getElementsByTagName('METAR');
        if (metars.length === 0) return null;
        return metars[0];
    }

    parseMetar(metar) {
        if (!metar) return null;
        return {
            stationId: metar.getElementsByTagName('station_id')[0].textContent,
            observationTime: metar.getElementsByTagName('observation_time')[0].textContent,
            windDirDegrees: metar.getElementsByTagName('wind_dir_degrees')[0].textContent,
            windSpeedKts: metar.getElementsByTagName('wind_speed_kt')[0].textContent,
            visibilityStatuteMi: metar.getElementsByTagName('visibility_statute_mi')[0].textContent,
            skyConditions: Array.from(metar.getElementsByTagName('sky_condition')).map(cond => ({
                skyCover: cond.getAttribute('sky_cover'),
                cloudBaseFtAgl: cond.getAttribute('cloud_base_ft_agl')
            })),
            temperatureC: metar.getElementsByTagName('temp_c')[0].textContent,
            dewPointC: metar.getElementsByTagName('dewpoint_c')[0].textContent,
            altimeterInHg: metar.getElementsByTagName('altim_in_hg')[0].textContent,
            flightRules: metar.getElementsByTagName('flight_rules')[0].textContent,
            wxString: metar.getElementsByTagName('wx_string')[0].textContent
        };
    }
}

customElements.define('weather-metar', WeatherMetar);