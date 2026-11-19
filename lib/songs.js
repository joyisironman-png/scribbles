/*
  Understanding a shared YouTube / YouTube Music link: title, artist, movie, and whether it's
  a song or a video. Works on what YouTube gives back (video title + channel name).
*/

export function findLink(text) {
  const m = String(text || "").match(/https?:\/\/[^\s]+/);
  return m ? m[0] : null;
}

const clean = (s) => s.replace(/\s+/g, " ").replace(/^[\s\-–|:]+|[\s\-–|:]+$/g, "").trim();

// Big record-label channels: the channel name isn't the artist.
const LABELS = /^(t-series|sony music.*|zee music.*|tips (official|music)|saregama.*|yrf|speed records|times music|eros now music|desi music factory|universal music.*|warner music.*|aditya music|lahari music|think music.*|sun music|white hill music|vyrl.*|t-series.*)$/i;

export function describeSong({ id, title = "", author = "", url = "" }) {
  const official = /- Topic$/i.test(author);
  const channel = author.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
  const label = LABELS.test(channel);
  let t = title;
  let movie = "";
  let artist = official ? channel : "";
  let credits = [];

  // "Song (From "Movie")"
  const from = t.match(/\(\s*from\s+["“'‘]?([^"”'’)]+)["”'’]?\s*\)/i);
  if (from) { movie = clean(from[1]); t = t.replace(from[0], ""); }

  // "Song - Movie | Actor | Composer | Singer"  or  "Song | Movie Song | Actor | Singer"
  const pipes = t.split(/\s*[|｜]\s*/).map(clean).filter(Boolean);
  if (pipes.length >= 2) {
    t = pipes[0];
    const rest = pipes.slice(1);
    const film = rest.find((p) => /\b(movie|film)\b/i.test(p));
    if (!movie && film) movie = clean(film.replace(/\b(full\s+)?(video\s+)?songs?\b|\b(movie|film)\b/gi, ""));
    credits = rest.filter((p) => p !== film).slice(0, 5);
  }
  const dash = t.split(/\s[-–—]\s/);
  if (dash.length >= 2) {
    if (pipes.length >= 2 || label) {
      // Indian label style: "Song - Movie"
      if (!movie) movie = clean(dash.slice(1).join(" - "));
      t = dash[0];
    } else if (!official && dash[0].length < 40) {
      // Western style: "Artist - Song"
      artist = clean(dash[0]);
      t = dash.slice(1).join(" - ");
    }
  }
  if (!artist && !label) artist = channel;

  const isVideo = /official\s+(music\s+)?video|music\s+video|lyric(al)?\s+video|\bMV\b|video\s+song/i.test(title);
  t = clean(t.replace(/\((official|lyric|lyrical|audio|video|music|full|hd|4k|remaster(ed)?)[^)]*\)|\[[^\]]*\]/gi, ""));
  const kind = /music\.youtube\.com/.test(url) || official ? "song" : isVideo ? "music video" : "video";

  return {
    vid: id,
    url: `https://music.youtube.com/watch?v=${id}`,
    title: t || title,
    artist,
    movie,
    credits,
    label: label ? channel : "",
    kind,
    raw: title,
  };
}

// Most-shared artists / songs, for quick picks.
export function topArtists(songs, n = 8) {
  const c = new Map();
  songs.forEach((s) => s.artist && c.set(s.artist, (c.get(s.artist) || 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
}
