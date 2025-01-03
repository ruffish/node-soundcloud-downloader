import { Transcoding } from './info';
import FORMATS from './formats';
import STREAMING_PROTOCOLS from './protocols';
export interface FilterPredicateObject {
    protocol?: STREAMING_PROTOCOLS;
    format?: FORMATS;
}
/** @internal */
declare const filterMedia: (media: Transcoding[], predicateObj: FilterPredicateObject) => Transcoding[];
export default filterMedia;
