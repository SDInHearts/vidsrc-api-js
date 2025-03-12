export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { tmdbId } = req.query;
  const season = req.query.s;
  const episode = req.query.e;

  if (!tmdbId) {
    return res.status(400).json({ error: 'Missing TMDB ID' });
  }

  try {
    const response = await getEmbedSu(tmdbId, season, episode);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching EmbedSu:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
}

async function getEmbedSu(tmdb_id, s, e) {
  const DOMAIN = "https://embed.su";
  const headers = {
    'User-Agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    'Referer': DOMAIN,
    'Origin': DOMAIN,
  };

  try {
    const urlSearch = s && e ? `${DOMAIN}/embed/tv/${tmdb_id}/${s}/${e}` : `${DOMAIN}/embed/movie/${tmdb_id}`;
    const htmlSearch = await fetch(urlSearch, { method: 'GET', headers });
    const textSearch = await htmlSearch.text();

    const hashEncodeMatch = textSearch.match(/JSON\.parse\(atob\(\`([^\`]+)/i);
    if (!hashEncodeMatch) return { sources: [], subtitles: [] };

    const hashEncode = hashEncodeMatch[1];
    const hashDecode = JSON.parse(await stringAtob(hashEncode));
    const mEncrypt = hashDecode.hash;
    if (!mEncrypt) return { sources: [], subtitles: [] };

    const firstDecode = (await stringAtob(mEncrypt)).split(".").map(item => item.split("").reverse().join(""));
    const secondDecode = JSON.parse(await stringAtob(firstDecode.join("").split("").reverse().join("")));

    if (!secondDecode || secondDecode.length === 0) return { sources: [], subtitles: [] };

    const sources = [];
    const subtitles = [];

    for (const item of secondDecode) {
      const urlDirect = `${DOMAIN}/api/e/${item.hash}`;
      const dataDirect = await requestGet(urlDirect, headers);
      if (!dataDirect.source) continue;

      const tracks = (dataDirect.subtitles || []).map(sub => ({
        url: sub.file,
        lang: sub.label.split('-')[0].trim()
      })).filter(track => track.lang);

      const requestDirectSize = await fetch(dataDirect.source, { headers, method: "GET" });
      const parseRequest = await requestDirectSize.text();
      const patternSize = parseRequest.split('\n').filter(item => item.includes('/proxy/'));

      const directQuality = patternSize.map(patternItem => {
        const sizeQuality = getSizeQuality(patternItem);
        let dURL = `${DOMAIN}${patternItem}`;
        dURL = dURL.replace("embed.su/api/proxy/viper/", "").replace(".png", ".m3u8");
        return { file: dURL, type: 'hls', quality: `${sizeQuality}p`, lang: 'en' };
      });

      if (!directQuality.length) continue;

      sources.push({
        provider: "EmbedSu",
        files: directQuality,
        headers
      });

      subtitles.push(...tracks);
    }

    return { sources, subtitles };
  } catch (error) {
    console.error("EmbedSu Error:", error);
    return { sources: [], subtitles: [] };
  }
}

function getSizeQuality(url) {
  const parts = url.split('/');
  const base64Part = parts[parts.length - 2];
  try {
    const decodedPart = atob(base64Part);
    return Number(decodedPart) || 1080;
  } catch {
    return 1080;
  }
}

async function stringAtob(input) {
  return Buffer.from(input, 'base64').toString('utf-8');
}

async function requestGet(url, headers = {}) {
  try {
    const response = await fetch(url, { method: 'GET', headers });
    return response.ok ? await response.json() : "";
  } catch {
    return "";
  }
}
