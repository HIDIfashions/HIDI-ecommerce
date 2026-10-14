import {sha256} from '@noble/hashes/sha256';
/** File.stream keeps hashing memory independent of the total original's size. */
export async function photoDigest(file){
  const hash=sha256.create();
  for await(const chunk of file.stream())hash.update(chunk);
  return Array.from(hash.digest(),byte=>byte.toString(16).padStart(2,'0')).join('');
}
