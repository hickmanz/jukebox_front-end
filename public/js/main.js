var playlistShown = true;
var optionsShown = false;
var windowState
var searchState = []
var currentResults = {};
var recentList 
var playerTimer
var tokenData;
var player = {
    volume: .5,
    currentPlaying: null,
    position: 0,
    duration:0,
    playback: null
}

var spotifyApi = new SpotifyWebApi();

$(function () {

    var socket = io('http://api.zaqify.com:8080/');
    socket.on("connect_error", function(data){
        $(".err-msg-server").show();
    })
    socket.on("connect", function(data){
        $(".err-msg-server").hide();
    })
    //var socket = io('http://localhost:8080/');

    var searchBox = document.getElementById('query')
    var searchTimeout = null;

    var playlistImgSetting

    if (window.localStorage.getItem('playlistimg') === null) {
        window.localStorage.setItem('playlistimg', 'big')
        playlistImgSetting = "big"
    } else {
        playlistImgSetting = window.localStorage.getItem('playlistimg')
    }

    configUserSettings()

    //init visual
    $(".artist-holder-row").hide();
    $("#search-outter").hide();
    $("#recent-outter").hide();
    $(".track-holder-row").hide();
    $(".album-holder-row").hide();
    $(".playlist-srch-holder-row").hide();
    $(".icon-pause").hide();

    $('.statusBar-holder').click(function(e) {
        var posX = e.pageX - $(this).offset().left + 1
        var percent = posX / $(this).width()
        var songPosition = player.duration * percent
        $("#statusBar-full").css('left', -100 + (percent *100) + '%');
        player.position = songPosition
        socket.emit('scrub', songPosition)
    });

    $(".icon-skip-forward").click(function(){
        socket.emit('next-song')
    })
    $(".icon-skip-back").click(function(){
        socket.emit('previous-song')
    })
    $(".icon-pause").click(function(){
        socket.emit('pause')
        $(".icon-pause").hide();
        $(".icon-play").show();
    })
    $(".icon-play").click(function(){
        socket.emit('play')
        $(".icon-pause").show();
        $(".icon-play").hide();
    })
    $(".shuffle-playlist").click(function(){
        console.log('sending shuffle command')
        showtoast('Shuffling Playlist!')
        socket.emit('shuffle-playlist')
    })
    $(".restart-player").click(function(){
        showtoast('Restarting player :(')
        socket.emit('restart-player')
    })
    $(".nuke-playlist").click(function(){
        showtoast('NUKING IT')
        var req = {};
        req.type = "nukeIt";
        socket.emit('editQueue', req);
    })
    searchBox.onkeyup = function (e) {
        // Clear the timeout if it has already been set.
        // This will prevent the previous task from executing
        // if it has been less than <MILLISECONDS>
        clearTimeout(searchTimeout);
    
        // Make a new timeout set to go off in 800ms
        searchTimeout = setTimeout(function () {
            searchSpotify(searchBox.value) //socket.emit('search', searchBox.value);
        }, 800);
    };
    //on expired token send to server and wait for update
    //set token when you get it
    function searchSpotify(data){
        changeSearchPage('destroy')
        console.log('search term: ' + data);

        checkToken().then(function(resp){
            spotifyApi.searchArtists(data)
                .then(function(response) {
                    //print it
                    artistSrchResp(response);
                }, function(err) {
                    console.error(err);
                });
            spotifyApi.searchAlbums(data)
                .then(function(response2) {
                    //print it
                    albumSrchResp(response2);
                }, function(err) {
                    console.error(err);
                });
            spotifyApi.searchTracks(data, {limit: 50})
                .then(function(response3) {
                    trackSrchResp(response3)
                }, function(err) {
                    console.error(err);
                }); 
            spotifyApi.searchPlaylists(data)
                .then(function(response4) {
                    console.dir(response4)

                    playlistSrchResp(response4)
                }, function(err) {
                    console.error(err);
                });  
        })
    }

    function checkToken(){
        return new Promise(function (fulfill, reject){
            var timeToExp = Math.floor(tokenData.spotifyTokenExpirationEpoch - new Date().getTime() / 1000)
            console.log("Token expires in:", timeToExp)
            if ( timeToExp < 500){
                console.log('Token expired. Requesting new one.')
                //request updated token.
                socket.emit('token_expired', 'holder', function(data){
                    tokenData = data
                    console.log(tokenData)
                    spotifyApi.setAccessToken(tokenData.access_token);
                    fulfill(true);
                    return(true)
                })
            } else {
                fulfill(true);
            }
        })
    }
    socket.on('updateTokenData', function(data){
        console.dir(data)
        tokenData = data
        spotifyApi.setAccessToken(tokenData.access_token)
      
    })


    $('form').submit(function(){
      socket.emit('search', searchBox.val());
      searchBox.blur();
      return false;
    });

    $('#track-list').on('click', 'div.add i', function() {
        var req = {};
        req.type = "addSong";
        showtoast('Song added!')
        req.data = currentResults.tracks[this.getAttribute('data-index')];
        socket.emit('editQueue', req);
    });

    $('.search-content-holder').on('click', 'li.see-more', function() {

        $( "#track-list li:nth-of-type(1n+12)" ).css("display", "flex");
        $( "#track-list li:last-child" ).css("display", "none");
    })

    $('.main').on('click', 'div.artist', function() {
        var id = this.getAttribute('data-id')
        var pageData={
            elid: getUID(),
            type: 'artist',
            id: id,
            markup: "",
            data: {}
        }

        checkToken().then(function(resp){
            spotifyApi.getArtist(pageData.id)
                .then(function(response) {
                    //print it
                    console.dir(response)
                    pageData.data = response
                    pageData.markup = getArtistSubPg(pageData)
                    changeSearchPage('artist', pageData)    
                }, function(err) {
                    console.error(err);
                });
        })

    });
    $('.main').on('click', 'div.playlist', function() {
        var id = this.getAttribute('data-id')
        var i = this.getAttribute('data-index')
        var pageData={
            elid: getUID(),
            type: 'playlist',
            id: id,
            markup: "",
            data: {},
            playlist: {}
        }
        
        pageData.playlist = currentResults.playlists[i]

        checkToken().then(function(resp){
            spotifyApi.getPlaylistTracks(pageData.id)
                .then(function(response) {
                    //print it
                    pageData.data = response
                    var newItems = []
                    response.items.forEach(element => {
                        newItems.push(element.track)
                    });
                    pageData.data.items = newItems
                    //take response and trim it

                    console.dir(pageData)

                    pageData.markup = getPlaylistSubPg(pageData)
                    changeSearchPage('playlist', pageData)    
                    

                }, function(err) {
                    console.error(err);
                });
        })

    })
    $('.main').on('click', 'div.album', function() {
        var id = this.getAttribute('data-id')
        var type = this.getAttribute('data-type')
        var i = this.getAttribute('data-index')

        var pageData={
            elid: getUID(),
            type: 'album',
            id: id,
            markup: "",
            data: {}
        }
       
        checkToken().then(function(resp){
            spotifyApi.getAlbumTracks(pageData.id)
                .then(function(response) {
                    //print it
                    pageData.data = response
                    if(type =="slow"){
                        spotifyApi.getAlbum(pageData.id)
                        .then(function(response2) {
                            for (var k=0; k < pageData.data.items.length; k++) {
                                pageData.data.items[k].album = response2
                            }
                            pageData.markup = getAlbumSubPg(pageData)
                            changeSearchPage('album', pageData)  
                        }, function(err) {
                            console.error(err);
                        });  
                    } else {
                        for (var k=0; k < pageData.data.items.length; k++) {
                            pageData.data.items[k].album =  currentResults.albums[i]
                        }
                        pageData.markup = getAlbumSubPg(pageData)
                        changeSearchPage('album', pageData)    
                    }

                }, function(err) {
                    console.error(err);
                });
        })

    });
    function getAlbumSubPg(pageData){
        console.dir(pageData.data)
        var markup =`
            <div id="${pageData.elid}" class="album-sub">
                <h1>
                    ${pageData.data.items[0].album.name}
                </h1>
                <div data-id="${pageData.elid}" class="button-filled add-album">
                    Add Album
                </div>
                <div>
                <ul>
                <li class="track-row top-row">
                    <div class="add"></div>
                    <div class="preview"></div>
                    <div class="title">TITLE</div>
                    <div class="artist">ARTIST</div>
                    <div class="album">ALBUM</div>
                    <div class="duration"><i class="icon-clock"></i></div>
                    <div class="popularity"><i class="icon-heart"></i></div>
                </li>
                ${pageData.data.items.map(track=>`<li class="track-row">
                        <div class="add"><i class="icon-plus" data-type="track" data-index=''></i></div>
                        <div class="preview"><i class="icon-headphones" data-type="track" data-trackid='${track.id}'></i></div>
                        <div class="title">${track.name}</div><div class="artist" data-type="slow" data-id=${track.artists[0].id}></div>
                        <div class="album" data-type="slow" data-id=${track.album.id}>${track.album.name}</div>
                        <div class="duration"></div>
                        <div class="popularity"> ${track.popularity}</div>
                    </li>`)}
            </ul>
                </div>

            </div>
        `
        return markup
    }
    function getPlaylistSubPg(pageData){

        var markup =`
            <div id="${pageData.elid}" class="playlist-sub">
                <h1>
                    ${pageData.playlist.name}
                </h1>
                <div data-id="${pageData.elid}" class="button-filled add-playlist">
                    Add Playlist
                </div>
                <ul>
                    <li class="track-row top-row">
                        <div class="add"></div>
                        <div class="preview"></div>
                        <div class="title">TITLE</div>
                        <div class="artist">ARTIST</div>
                        <div class="album">ALBUM</div>
                        <div class="duration"><i class="icon-clock"></i></div>
                        <div class="popularity"><i class="icon-heart"></i></div>
                    </li>
                    ${pageData.data.items.map(track=>`<li class="track-row">
                            <div class="add"><i class="icon-plus" data-type="track" data-index=''></i></div>
                            <div class="preview"><i class="icon-headphones" data-type="track" data-trackid='${track.id}'></i></div>
                            <div class="title">${track.name}</div><div class="artist" data-type="slow" data-id=${track.artists[0].id}></div>
                            <div class="album" data-type="slow" data-id=${track.album.id}>${track.album.name}</div>
                            <div class="duration"></div>
                            <div class="popularity"> ${track.popularity}</div>
                        </li>`)}
                </ul>

            </div>
        `
        return markup
    }
    $('.main').on('click', 'div.add-album', function() {
        var id = this.getAttribute('data-id')
        var index = searchState.map(function(x) {return x.elid; }).indexOf(id);
   
        console.log(index)
        var data = searchState[index]
        console.dir(searchState)
        var req = {};
        req.type = "addSong";
        showtoast('Album Added!')
        req.data = data.data.items;
        socket.emit('editQueue', req);

    })
    $('.main').on('click', 'div.add-playlist', function() {
        var id = this.getAttribute('data-id')
        var index = searchState.map(function(x) {return x.elid; }).indexOf(id);

        var data = searchState[index]
        var req = {};
        req.type = "addSong";
        showtoast('Playlist Added!')
        req.data = data.data.items;
        socket.emit('editQueue', req);

    })
    $('.main').on('click', 'div.add-album-quick', function() {
        var id = this.getAttribute('data-id')
    })

    function getArtistSubPg(pageData){
        var markup =`
            <div id="${pageData.elid}" class="artist-sub">
                <div>
                    ${pageData.data.name}
                </div>
                <div>
                    Add Artist
                </div>
                <div>
                    --More coming--
                </div>

            </div>
        `
        return markup
    }
    $('.main').on('click', 'i.search-back', function() {
        console.log('back a page')
        changeSearchPage('back')
    })

    function changeSearchPage(type, pageData){
        if(type=="artist"){
            searchState.push(pageData)
            $(".search-content-holder").hide();
            $(".search-back").show();
            $('.search-overlay-holder').append(pageData.markup)

            //show page
        } else if(type=="album"){
            searchState.push(pageData)
            $(".search-content-holder").hide();
            $(".search-back").show();
            $('.search-overlay-holder').append(pageData.markup)
        }else if(type=="playlist"){
            searchState.push(pageData)
            $(".search-content-holder").hide();
            $(".search-back").show();
            $('.search-overlay-holder').append(pageData.markup)
        }else if (type="back"){
            
            if(searchState.length > 0){
                var rmPage = searchState.pop()
                document.getElementById(rmPage.elid).remove();
                if(searchState.length > 0){
                    //show searchState[searchState.length-1].elid
                }else {
                    //show main search page
                    $(".search-content-holder").show();
                    $(".search-back").hide();
                }
            }
            //go to prev
            //if prev is nothing then show search results again
        } else if (type=="destroy"){
            //remove all elements and delete them
            $(".search-content-holder").show();
            $(".search-back").hide();
            searchState.forEach(element => {
                document.getElementById(element.elid).remove();
            });

        }
        
        $('#search-outter').scrollTop(0);

    

        //do stuff
    }
    $('#track-list').on('click', 'div.preview i', function(e) {
        var req = {};
        req.type = "previewSong";
        req.data = this.getAttribute('data-trackid');
        socket.emit('preview', req);
    });
    $('#recent-track-list').on('click', 'div.add i', function() {
        var req = {};
        req.type = "addSong";
        showtoast('Song added!')
        req.data = recentList[this.getAttribute('data-index')].track;
        socket.emit('editQueue', req);
    });
    $('#recent-track-list').on('click', 'div.preview i', function(e) {
        var req = {};
        req.type = "previewSong";
        req.data = this.getAttribute('data-trackid');
        socket.emit('preview', req);
    });
    $('.queue').on('click', 'div.remove', function(e) {
        var req = {};
        req.type = "removeSong";
        req.data = $(this).parent().data('guid');
        console.log(req.data)
        socket.emit('editQueue', req);
        showtoast('Song Removed')
    });
    socket.on('test',function(data){
        console.dir(data);
    });
    socket.on('updateQueue', function(queue){
        console.dir(queue)
        $(".queue").empty();
        for (var i=0; i < queue.length; i++) {
            var li = $("<li />");
            li.html(getPlaylistDiv(queue[i]));
            li.attr("data-trackid", queue[i].id);
            li.attr("data-guid", queue[i].guid);
            $(".queue").append(li);
        }
    });
    socket.on('update-player', function(data){
        //check if song is the same
        if(player.currentPlaying !== null){
            if(data.currentPlaying !== null){
                if(player.currentPlaying.id == data.currentPlaying.id){
                    player = data
                    updatePlayerTime()
                    //same song so dont update pics and stuff
                    //update time
                } else {
                    player = data
                    updatePlayer()
                    updatePlayerTime()
                    //uodate all
                }

            }
        } else {
            player = data
            updatePlayer()
            updatePlayerTime()
            //uodate all
            //update all
        }
        if(player.state == "playing"){
            $(".icon-pause").show();
            $(".icon-play").hide();
        } else {
            $(".icon-pause").hide();
            $(".icon-play").show();
        }
    })
    socket.on('recently-played', function(data){
        var tracks = data.body.items;
        recentList = tracks

        var markup = `
        <li class="track-row top-row">
            <div class="add"></div>
            <div class="preview"></div>
            <div class="title">TITLE</div>
            <div class="artist">ARTIST</div>
            <div class="album">ALBUM</div>
            <div class="duration"><i class="icon-clock"></i></div>
            <div class="popularity"><i class="icon-heart"></i></div>
        </li>
        `
        var endrow = `
        <li class="track-row last-row see-more">
            SEE MORE
        </li>
        `


        $("#recent-track-list").empty();

        $(".track-holder-row").show();

        var div = $("<li />");
        div.html(markup);
        $("#recent-track-list").append(div);
        console.dir(tracks)
        for (var i=0; i < tracks.length; i++) {
            $("#recent-track-list").append(getTrackDiv(tracks[i].track, i));
        }

        $("#recent-track-list").append(endrow);
    })


    function artistSrchResp(data){
        var i;
        var artists = data.artists.items;

        $("#artist-holder-inner").empty();

        currentResults.artists = artists;

        if (artists.length < 5){
            i = artists.length;
        } else {
            i = 9;
        }

        if (i > 0){
            //$(".artist-holder-row").show();
        } else {
            $(".artist-holder-row").hide();
        }
        for (var k=0; k < i; k++) {
            var div = $("<div />");
            div.html(getArtistDiv(artists[k]));
            $("#artist-holder-inner").append(div);
        }
    }
    function trackSrchResp(data){
        var tracks = data.tracks.items;

        $("#track-list").empty();

        currentResults.tracks = tracks;

        $(".track-holder-row").show();
        var markup =`
        <li class="track-row top-row">
            <div class="add"></div>
            <div class="preview"></div>
            <div class="title">TITLE</div>
            <div class="artist">ARTIST</div>
            <div class="album">ALBUM</div>
            <div class="duration"><i class="icon-clock"></i></div>
            <div class="popularity"><i class="icon-heart"></i></div>
        </li>
        `
        var endrow = `
        <li class="track-row last-row see-more">
            SEE MORE
        </li>
        `


        $("#track-list").append(markup);

        for (var i=0; i < tracks.length; i++) {

            $("#track-list").append(getTrackDiv(tracks[i], i));
        }

        $("#track-list").append(endrow);


    }
    function albumSrchResp(data){
        var i;
        var albums = data.albums.items;

        $("#album-holder-inner").empty();

        currentResults.albums = albums;

        if(albums.length < 5){
            i = albums.length;
        } else {
            i = 9;
        }

        if (i > 0){
            $(".album-holder-row").show();
        } else {
            $(".album-holder-row").hide();
        }

        for (var k=0; k < i; k++) {
            var div = $("<div />");
            div.html(getAlbumDiv(albums[k], k));
            $("#album-holder-inner").append(div);
        }
    }
    function playlistSrchResp(data){
        var i;
        var playlists = data.playlists.items;

        $("#playlist-srch-holder-inner").empty();

        currentResults.playlists = playlists;

        if(playlists.length < 5){
            i = playlists.length;
        } else {
            i = 9;
        }

        if (i > 0){
            $(".playlist-srch-holder-row").show();
        } else {
            $(".playlist-srch-holder-row").hide();
        }

        
        for (var k=0; k < i; k++) {
            var div = $("<div />");
            div.html(getPlaylistSrchDiv(playlists[k], k));
            $("#playlist-srch-holder-inner").append(div);
        }
    }
    socket.on('previewData', function(trackData){
        var a = new Audio(trackData.body.tracks[0].preview_url);
        a.play();
    })
    $('#search').click(function () { // When arrow is clicked
        if (playlistShown == true){
            showSearch()
        } else if (windowState == "search"){
            showPlaylist()
        } else {
            showSearch()
        }
    });
    $('.options-label').click(function () { // When arrow is clicked
        toggleOptions()
    });
    $('#recent').click(function () { // When arrow is clicked
        socket.emit('get-recently-played')
        if (playlistShown == true){
            showRecent()
        } else if (windowState == "recent"){
            showPlaylist()
        } else {
            showRecent()
        }
    });
    $('.current-song-content').click(function () { // When arrow is clicked
        if(playlistShown == false){
            showPlaylist();
        } else {
            //if not control-status class
            showSearch()
        }
    }).find('.control-status').click(function(e) {
        if(playlistShown == false){
            showPlaylist();
        } else {
            e.stopPropagation();
        }
    });
 
    $('.logo-holder').click(function () { // When arrow is clicked
        if(playlistShown == false){
            showPlaylist();
        }
    });
    $( "#sortable" ).sortable({
        start: function(e, ui) {
            // creates a temporary attribute on the element with the old index
            $(this).attr('data-previndex', ui.item.index());
        },
        update: function(e, ui) {
            // gets the new and old index then removes the temporary attribute
            var newIndex = ui.item.index();
            var oldIndex = $(this).attr('data-previndex');
            var req = {};
            req.type = "moveSong";
            req.data = {};
            req.data.newIndex = newIndex;
            req.data.oldIndex = oldIndex;
            req.data.trackId = ui.item.data('trackid');
            socket.emit('editQueue', req);
            $(this).removeAttr('data-previndex');

        }
    });
    $( "#sortable" ).disableSelection();

function configUserSettings(){
    //playlist image size settings
    $("#playlist-view-options").val(playlistImgSetting);
    if(playlistImgSetting == "bigImages"){
        $(".playlist-holder").removeClass("smallImages");
        $(".playlist-holder").removeClass("noImages");
    } else if(playlistImgSetting == "smallImages"){
        $(".playlist-holder").addClass("smallImages");
        $(".playlist-holder").removeClass("noImages");
    }else if (playlistImgSetting == "noImages"){
        $(".playlist-holder").removeClass("smallImages");
        $(".playlist-holder").addClass("noImages");
    }
}
$("#playlist-view-options").on('change', function() {
    window.localStorage.setItem('playlistimg', $(this).val())
    playlistImgSetting = $(this).val()
    configUserSettings()
});

function updatePlayer(){
    if(player.currentPlaying == null){

    } else {
        var imageUrl
        var artists = "";
        if (player.currentPlaying.album.images.length < 1){
            imageUrl ='./images/no-album.jpg';
        } else {
            imageUrl = player.currentPlaying.album.images[0].url;
        }
        for (i=0; i < player.currentPlaying.artists.length; i++){
            if (i < player.currentPlaying.artists.length - 1){
                artists += player.currentPlaying.artists[i].name + ", "; 
            } else {
                artists += player.currentPlaying.artists[i].name
            }
        }
        $('.current-song-background').css('background-image', 'url(' + imageUrl + ')');
        $(".current-song-content .artwork").attr('src', imageUrl);
        $(".current-song-content .song-name").text(player.currentPlaying.name)
        $(".current-song-content .song-artist").text(artists)
        $("#endTime").text(msToTime(player.duration))
    }
}
function updatePlayerTime(){
    clearInterval(playerTimer)
    if (player.state == "playing"){
        playerTimer = setInterval(function(){  updateStatusBar() }, 500);
    }     
}
function updateStatusBar(){
    player.position += 500
    var percentFinished
    var startTime
    percentFinished = -100 + (( player.position/player.duration ) * 100)
    startTime = msToTime(player.position)
    $("#currentTime").text(startTime)
    $("#statusBar-full").css('left', percentFinished + '%');

}
function msToTime(duration) {
    var milliseconds = parseInt((duration%1000)/100)
        , seconds = parseInt((duration/1000)%60)
        , minutes = parseInt((duration/(1000*60))%60)
        , hours = parseInt((duration/(1000*60*60))%24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;

    if(hours == 0){
        minutes = (minutes < 10) ? "" + minutes : minutes;

        return minutes + ":" + seconds

    } else {
        return hours + ":" + minutes + ":" + seconds
    }
}
function showSearch() {
    windowState = "search"
    $("#search-outter").show();
    $("#recent-outter").hide();
    $(".menu-expand-holder").addClass("expand");
    $(".current-song-holder").addClass("collapse");
    searchBox.focus()
    playlistShown = false;
}
function toggleOptions() {
    if(optionsShown){
        $(".options-cover").removeClass("expanded");
        optionsShown = false;
    } else {
        $(".options-cover").addClass("expanded");
        optionsShown = true;
    }
}
function showRecent() {
    windowState = "recent"
    $("#search-outter").hide();
    $("#recent-outter").show();
    $(".menu-expand-holder").addClass("expand");
    $(".current-song-holder").addClass("collapse");
    playlistShown = false;
}
function showPlaylist() {
    windowState == "playlist"
    $(".menu-expand-holder").removeClass("expand");
    $(".current-song-holder").removeClass("collapse");
    playlistShown = true;
}

function getArtistDiv(data, index){
    var i = data.images.length - 1;
    var imageUrl

    if (i < 0){
        imageUrl = "";
    } else {
        imageUrl = data.images[i].url;
    }

    var markup = `
    <div class="artist-holder artist" data-id="${data.id}">
        <div class="picture" style="background-image: url('${imageUrl}')"></div>
        ${data.name}
    </div>
    `

    return markup;
}
function getAlbumDiv(data, index){
    var i = data.images.length - 2;
    var imageUrl
    var artists = "";
    if (i < 0){
        imageUrl = "";
    } else {
        imageUrl = data.images[i].url;
    }
    for (i=0; i < data.artists.length; i++){
        if (i < data.artists.length - 1){
            artists += data.artists[i].name + ", "; 
        } else {
            artists += data.artists[i].name
        }
    }
    var markup =`
    <div class="album-holder album" data-index=${index} data-id="${data.id}">
        <div class="picture" style="background-image: url('${imageUrl}')">
        </div>
        <div class="album">${data.name}</div>
        <div class="artist">${artists}</div>
    </div>
    `
    return markup
}
function getPlaylistSrchDiv(data, index){
    var i = data.images.length - 1;
    var imageUrl
    var artists = "";
    if (i < 0){
        imageUrl = "";
    } else {
        imageUrl = data.images[i].url;
    }

    var markup =`
    <div class="playlist-srch-holder playlist" data-index=${index} data-id="${data.id}">
        <div class="picture" style="background-image: url('${imageUrl}')">
        </div>
        <div class="album">${data.name}</div>

    </div>
    `
    return markup
}
function getTrackDiv(data, index){
    var artists = "";
    for (i=0; i < data.artists.length; i++){
        if (i < data.artists.length - 1){
            artists += data.artists[i].name + ", "; 
        } else {
            artists += data.artists[i].name
        }
    }

    var min = Math.floor((data.duration_ms/1000/60) << 0);
    var sec = Math.floor((data.duration_ms/1000) % 60);
    var duration = min + ':' + sec;

    var markup = `
    <li class="track-row">
        <div class="add"><i class="icon-plus" data-type="track" data-index='${index}'></i></div>
        <div class="preview"><i class="icon-headphones" data-type="track" data-trackid='${data.id}'></i></div>
        <div class="title">${data.name}</div><div class="artist" data-type="slow" data-id=${data.artists[0].id}>${artists}</div>
        <div class="album" data-type="slow" data-id=${data.album.id}>${data.album.name}</div>
        <div class="duration">${duration}</div>
        <div class="popularity"> ${data.popularity}</div>
    </li>
    `;

    return markup;
}
function getPlaylistDiv(data){
    var imageUrl
    var artists = "";
    if (data.album.images.length < 1){
        imageUrl = './images/no-album.jpg'
    } else {
        imageUrl = data.album.images[0].url;
    }
    for (i=0; i < data.artists.length; i++){
        if (i < data.artists.length - 1){
            artists += data.artists[i].name + ", "; 
        } else {
            artists += data.artists[i].name
        }
    }

    return `<img class="artwork" src="` + imageUrl + `"/>
                <div class="details">
                    <div class="description">
                        <div class="song-name">
                            ` + data.name + `
                        </div>
                        <div class="song-artist">
                            ` + artists + `
                        </div>
                    </div>
                </div>
                <div class="remove">
                <i>X</i>
                </div>`;
}

function getUID(){
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      )
}

function ToastBuilder(options) {
    // options are optional
    var opts = options || {};
    
    // setup some defaults
    opts.defaultText = opts.defaultText || 'default text';
    opts.displayTime = opts.displayTime || 3000;
    opts.target = opts.target || 'body';
  
    return function (text) {
      $('<div/>')
        .addClass('toast')
        .prependTo($(opts.target))
        .text(text || opts.defaultText)
        .queue(function(next) {
          $(this).css({
            'opacity': 1
          });
          var bottomOffset = 15;
          $('.toast').each(function() {
            var $this = $(this);
            var height = $this.outerHeight();
            var offset = 8;
            $this.css('bottom', bottomOffset + 'px');
  
            bottomOffset += height + offset;
          });
          next();
        })
        .delay(opts.displayTime)
        .queue(function(next) {
          var $this = $(this);
          var width = $this.outerWidth() + 20;
          $this.css({
            'right': '-' + width + 'px',
            'opacity': 0
          });
          next();
        })
        .delay(600)
        .queue(function(next) {
          $(this).remove();
          next();
        });
    };
  }
  
  // customize it with your own options
  var myOptions = {
    defaultText: 'Toast, yo!',
    displayTime: 3000,
    target: '.content-holder'
  };
    //position: 'top right',   /* TODO: make this */
    //bgColor: 'rgba(0,0,0,0.5)', /* TODO: make this */
  
  // to get it started, instantiate a copy of
  // ToastBuilder passing our custom options
  var showtoast = new ToastBuilder(myOptions);
  
  // now you can fire off a toast just calling
  // our new instance passing a string, like this:
  // showtoast('hello, world!');
  
});