/** @internal @packageDocumentation */

import { AxiosInstance } from 'axios'
import m3u8stream from 'm3u8stream';
import { handleRequestErrs, appendURL } from './util'
import getInfo, { Transcoding } from './info'

export const getMediaURL = async (url: string, clientID: string, axiosInstance: AxiosInstance): Promise<string> => {
  const res = await axiosInstance.get(appendURL(url, 'client_id', clientID), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.129 Safari/537.36',
      Accept: '*/*',
      'Accept-Encoding': 'gzip, deflate, br'
    },
    withCredentials: true
  })
  if (!res.data.url) throw new Error(`Invalid response from Soundcloud. Check if the URL provided is correct: ${url}`)
  return res.data.url
}

export const getProgressiveStream = async (mediaUrl: string, axiosInstance: AxiosInstance) => {
  console.log("Requesting progressive stream:", mediaUrl);
  const r = await axiosInstance.get(mediaUrl, {
    withCredentials: true,
    responseType: 'stream'
  })

  return r.data
}

export const getHLSStream = (mediaUrl: string) => {
  console.log("Requesting HLS stream:", mediaUrl);
  return m3u8stream(mediaUrl)
    .on('response', (response) => {
      console.log("HLS stream response status:", response.statusCode);
    })
    .on('error', (error) => {
      console.error("HLS stream error:", error.message);
    });
}

type fromURLFunctionBase = (url: string, clientID: string,
  getMediaURLFunction: (url: string, clientID: string, axiosInstance: AxiosInstance) => Promise<string>,
  getProgressiveStreamFunction: (mediaUrl: string, axiosInstance: AxiosInstance) => Promise<any>,
  getHLSStreamFunction: (mediaUrl: string) => m3u8stream.Stream,
  axiosInstance: AxiosInstance) => Promise<any | m3u8stream.Stream>

export const fromURLBase: fromURLFunctionBase = async (url: string, clientID: string,
  getMediaURLFunction: (url: string, clientID: string, axiosInstance: AxiosInstance) => Promise<string>,
  getProgressiveStreamFunction: (mediaUrl: string, axiosInstance: AxiosInstance) => Promise<any>,
  getHLSStreamFunction: (mediaUrl: string) => m3u8stream.Stream,
  axiosInstance: AxiosInstance):Promise<any | m3u8stream.Stream> => {
  try {
    const mediaUrl = await getMediaURLFunction(url, clientID, axiosInstance)

    if (url.includes('/progressive')) {
      return await getProgressiveStreamFunction(mediaUrl, axiosInstance)
    }

    return getHLSStreamFunction(mediaUrl)
  } catch (err) {
    throw handleRequestErrs(err)
  }
}

export const fromURL = async (url: string, clientID: string, axiosInstance: AxiosInstance): Promise<any | m3u8stream.Stream> => await fromURLBase(url, clientID, getMediaURL, getProgressiveStream, getHLSStream, axiosInstance)

export const fromMediaObjBase = async (media: Transcoding, clientID: string,
  getMediaURLFunction: (url: string, clientID: string, axiosInstance: AxiosInstance) => Promise<string>,
  getProgressiveStreamFunction: (mediaUrl: string, axiosInstance: AxiosInstance) => Promise<any>,
  getHLSStreamFunction: (mediaUrl: string) => m3u8stream.Stream,
  fromURLFunction: typeof fromURL,
  axiosInstance: AxiosInstance): Promise<any | m3u8stream.Stream> => {
  if (!validatemedia(media)) throw new Error('Invalid media object provided')

  console.log("Media object transcodings:", JSON.stringify(media, null, 2));
  console.log("Media URL: ", media.url);
  return await fromURLFunction(media.url, clientID, axiosInstance)
}

export const fromMediaObj = async (media: Transcoding, clientID: string, axiosInstance: AxiosInstance) => await fromMediaObjBase(media, clientID, getMediaURL, getProgressiveStream, getHLSStream, fromURL, axiosInstance)

export const fromDownloadLink = async (id: number, clientID: string, axiosInstance: AxiosInstance) => {
  const { data: { redirectUri } } = await axiosInstance.get(appendURL(`https://api-v2.soundcloud.com/tracks/${id}/download`, 'client_id', clientID))
  const { data } = await axiosInstance.get(redirectUri, {
    responseType: 'stream'
  })

  return data
}

/** @internal */
export const download = async (url: string, clientID: string, axiosInstance: AxiosInstance, useDownloadLink = false) => {
  const info = await getInfo(url, clientID, axiosInstance);
  
  if (info.downloadable && useDownloadLink) {
    // Attempt direct download if `downloadable` is true
    try {
      return await fromDownloadLink(info.id, clientID, axiosInstance);
    } catch (err) {
      console.error("Error with direct download:", err.message);
    }
  }

  // Find the first compatible transcoding (progressive or HLS)
  const compatibleTranscoding = info.media.transcodings.find(transcoding =>
    transcoding.format.protocol === "progressive" || transcoding.format.protocol === "hls"
  );

  if (!compatibleTranscoding) {
    throw new Error("No compatible transcoding found (progressive or hls).");
  }

  console.log(`Using transcoding: ${JSON.stringify(compatibleTranscoding, null, 2)}`);

  // Use the found transcoding
  return await fromMediaObj(compatibleTranscoding, clientID, axiosInstance);
};

const validatemedia = (media: Transcoding) => {
  if (!media.url || !media.format) {
    console.error("Invalid media object:", media);
    return false;
  }
  console.log("Valid media object:", media);
  return true;
};

/**
 * Return the media.url for a track, using the same signature as `download`.
 */
export const getMediaUrlOnly = async (
  url: string,
  clientID: string,
  axiosInstance: AxiosInstance,
  useDownloadLink = false
): Promise<string> => {
  // 1) Fetch track info
  const info = await getInfo(url, clientID, axiosInstance);

  // 2) (Optional) If the track is downloadable and useDownloadLink is true,
  //    normally you'd attempt direct download. But since we only want
  //    the media URL from a transcoding, we can skip that logic or leave
  //    it out. (This block is commented out for clarity.)
  /*
  if (info.downloadable && useDownloadLink) {
    try {
      // This normally returns a "download" stream, not a media URL.
      // So we won't use it here. Just showing how it would normally look:
      const downloadData = await fromDownloadLink(info.id, clientID, axiosInstance);
      // But that doesn't yield a .url. So we skip returning here.
    } catch (err: any) {
      console.error("Error with direct download:", err.message);
    }
  }
  */

  // 3) Find the first progressive or hls transcoding
  const compatibleTranscoding = info.media.transcodings.find(
    (transcoding) =>
      transcoding.format.protocol === 'progressive' ||
      transcoding.format.protocol === 'hls'
  );

  if (!compatibleTranscoding) {
    throw new Error('No compatible transcoding found (progressive or hls).');
  }

  const mediaUrl = getMediaURL(compatibleTranscoding.url, clientID, axiosInstance);
  
  return mediaUrl
};