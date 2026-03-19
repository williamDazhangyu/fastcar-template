import { DataMap } from "@fastcar/core";

export const ZipMap = new DataMap<string, string>();
ZipMap.set(".zip", "zip");
ZipMap.set(".tar", "tar");
ZipMap.set(".tar.gz", "tgz");
ZipMap.set(".gz", "gzip");
ZipMap.set(".tgz", "tgz");

export const ZipSuffixs = ZipMap.toKeys();
