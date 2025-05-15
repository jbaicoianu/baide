<html>
  <body>
    <script src="https://web.janusxr.org/1.5.53/janusweb.js"></script>
    <janus-viewer>
      <assets>
        <assetscript src="weather-metar.js" />
        <assetobject id="room_plane" src="https://example.com/room_plane.glb" />
        <assetshader id="clouds" src="skyclouds.txt" shadertype="shadertoy" />
      </assets>
      <room asset="room_plane" pos="0 0 0">
        <weather-metar stationid="KOAK" />
      </room>
    </janus-viewer>
  </body>
</html>