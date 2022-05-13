const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const { C_secret, C_id } = require("./secret.js");
const server_root = `http://localhost:8000`;
const song_state = [];
const user_state = [];
const port = process.env.PORT || 8000;

const server = http.createServer((req, res) => {
  if (req.url == "/") {
    const readStream = fs.createReadStream("index.html");
    readStream.pipe(res);
  } else if (req.url.startsWith("/search")) {
    const state = crypto.randomBytes(20).toString("hex");
    const theUrl = new URL(req.url, `${server_root}`).searchParams;
    song_state.push({
      artist: theUrl.get("artist"),
      song: theUrl.get("song"),
      state: state,
    });
    let cache_valid = false;
    const access = "./token/token.json";
    if (fs.existsSync(access)) {
      let access_token = require(access).access_token;
      let expire_time = require(access).expire_time;
      if (
        access_token != undefined &&
        expire_time != undefined &&
        new Date().getTime() < expire_time
      ) {
        cache_valid = true;
      } else {
        cache_valid = false;
      }
    }
    if (cache_valid) {
      console.log(`${server_root}/lyrics?state=${state}`);
      res
        .writeHead(302, {
          Location: `${server_root}/lyrics?state=${state}`,
        })
        .end();
    } else {
      const url = theURL({ state });
      res.writeHead(302, { Location: `${url}` });
      res.end();
    }
  } else if (req.url == "/index.css") {
    const readStream = fs.createReadStream("index.css");
    readStream.pipe(res);
  } else if (req.url == "/thegif.gif") {
    const readStream = fs.createReadStream("thegif.gif");
    res.writeHeader(200, { "Content-Type": "image/gif" });
    readStream.pipe(res);
  } else if (req.url == "/403.css") {
    const readStream = fs.createReadStream("403.css");
    readStream.pipe(res);
  } else if (req.url.startsWith("/lyrics")) {
    const theUrl = new URL(req.url, `${server_root}`);
    const code = theUrl.searchParams.get("code");
    const state = theUrl.searchParams.get("state");
    let person = song_state.filter((x) => {
      return x.state == state;
    });
    if (!person[0] || (code && !person[0])) {
      res.writeHead(302, { Location: `${server_root}/403` });
      res.end();
    } else {
      const access = "./token/token.json";
      let cache_valid = false;
      if (fs.existsSync(access)) {
        let access_token = require(access).access_token;
        let expire_time = require(access).expire_time;
        if (
          access_token != undefined &&
          expire_time != undefined &&
          new Date().getTime() < expire_time
        ) {
          cache_valid = true;
          console.log(person);
          tradeToken({
            token_object: { access_token, expire_time },
            artist: person[0].artist,
            song: person[0].song,
            res,
            state,
          });
        } else {
          cache_valid = false;
        }
      }
      if (!cache_valid) {
        let obj = {
          code: code,
          client_id: C_id,
          client_secret: C_secret,
          redirect_uri: `${server_root}/lyrics`,
          response_type: "code",
          grant_type: "authorization_code",
        };
        const getAuth = https.request(
          `https://api.genius.com/oauth/token`,
          {
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
          (stream_this) => {
            let data = "";
            stream_this.on("data", (chunk) => (data += chunk));
            stream_this.on("end", () => {
              console.log(person.song);
              tradeToken({
                token_object: JSON.parse(data),
                artist: person[0].artist,
                song: person[0].song,
                res,
                state,
              });
            });
          }
        );
        getAuth.write(JSON.stringify(obj));
        getAuth.end();
      }
    }
  } else if (req.url == "/403") {
    const readStream = fs.createReadStream("403.html");
    readStream.pipe(res);
  } else {
    const readStream = fs.createReadStream("index.html");
    readStream.pipe(res);
  }
});

function tradeToken({ artist, song, token_object, res, state }) {
  token_object.expire_time = new Date().getTime() + 3600000;
  fs.writeFile(
    "token/token.json",
    JSON.stringify(token_object),
    (err, data) => {
      if (err) {
        console.log(err);
      }
    }
  );

  const getLyrics = https.request(
    `https://api.lyrics.ovh/v1/${artist}/${song}`,
    {
      method: "GET",
    },
    (stream_this) => {
      let data = "";
      stream_this.on("data", (chunk) => (data += chunk));
      stream_this.on("end", () => {
        console.log(`https://api.lyrics.ovh/v1/${artist}/${song}`);
        printLyrics({
          artist,
          song,
          data,
          res,
          token_object,
          state,
        });
      });
    }
  );
  getLyrics.end();
}

function printLyrics({ state, artist, song, data, res, token_object }) {
  const getUser = https.request(
    `https://genius.com/api/account?access_token=${token_object.access_token}`,
    {
      method: "GET",
    },
    (stream_this) => {
      let userInfo = "";
      stream_this.on("data", (chunk) => (userInfo += chunk));
      stream_this.on("end", () => {
        userInfo = JSON.parse(userInfo);
        user_state.push({ state, userInfo });
        fetchAgain({ state, artist, song, userInfo, res, data });
      });
    }
  );
  getUser.end();
}

function fetchAgain({ state, artist, song, userInfo, res, data }) {
  let imgSrc = `https://cdn2.iconfinder.com/data/icons/documents-and-files-v-2/100/doc-03-512.png`;
  let obj = [];
  let img = "";
  let printed = false;

  const getArtists = https.request(
    `https://genius.com/api/search?q=${artist}`,
    {
      method: "GET",
    },
    (stream_this) => {
      let dat = "";
      stream_this.on("data", (chunk) => (dat += chunk));
      stream_this.on("end", () => {
        obj = JSON.parse(dat);
        obj.response.hits.forEach((x, i) => {
          if (x.result.title.toUpperCase() == song.toUpperCase()) {
            console.log(x.result.song_art_image_url);
            img = x.result.song_art_image_url;
            printComponent({
              state,
              artist,
              song,
              userInfo,
              res,
              data,
              img,
            });
            printed = true;
          }
          if (i == obj.response.hits.length - 1 && printed == false) {
            img = imgSrc;
            printComponent({
              state,
              artist,
              song,
              userInfo,
              res,
              data,
              img,
            });
          }
        });
      });
    }
  );
  getArtists.end();
}

function printComponent({ state, artist, userInfo, res, data, img }) {
  user = user_state.filter((x) => {
    return x.state == state;
  });
  if (!user) {
    res.writeHead(302, { Location: `${server_root}/403` });
    res.end();
  } else {
    let lyrics = JSON.parse(data).lyrics;
    const str = `${user[0].userInfo.response.user?.identities[0]?.name}`;
    const name = str.split(/ (.*)/);

    const component = `
    <head>
        <style>
        .ha{
            background-color: #1f233d;
        }
        .ha a{
            color:white;
            margin: 10px 15px;
            
        }
        .leftside{
            margin-left: 25px;
        }
         .rightside{
            margin-right: 45px;
        }
        .leftside a{
            cursor: pointer;
            text-decoration: none;
        }
        </style>
    <head>
    <body style=" margin:0; padding:0; background-color:#e6e5e1;">
    <div style="margin: 0 auto;">
        <div class="ha" style="display:flex; justify-content: space-between; align-items:center; padding-top:0; height:100px; width: 100%; position: fixed;">
            <div class="leftside" style="align-items:center; display:flex;">
                <div>
                    <a href="/">Home</a>
                </div>
                <div>
                    <a>All artists</a>
                </div>
                <div>
                    <a>find songs</a>
                </div>
            </div>
                <div class="rightside" style="color:white;display:flex; ">
                    <p>Hello ${name[0]} </p>
                </div>
        </div>
        <div style=" display:flex; max-width:700px; margin:0 auto;">
            <div style="margin:0 auto; margin-top:120px; text-align:center;">
                <img  width=100 height=100 src="${img}" />\n
                <h4 style="font-size: 20px;">Artist: ${artist} </h4>\n
                <h4 style="font-size: 17px;">[Lyrics] </h4> <p style="font-size: 17px; max-width:500px; white-space:pre-wrap;"> ${lyrics} </p>
            </div>
        </div>
    </div>
    </body>
  `;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write(`<p>${component}</p>`);
    res.end();
  }
}

function theURL({ state }) {
  const root_url = `https://api.genius.com/oauth/authorize`;
  const options = {
    client_id: C_id,
    redirect_uri: `${server_root}/lyrics`,
    scope: "me",
    response_type: "code",
    state: state,
  };
  const query = new URLSearchParams(options).toString();
  return `${root_url}?${query}`;
}

server.listen(port, () => {
  console.log("Server is up and running");
});
