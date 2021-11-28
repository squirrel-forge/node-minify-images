# @squirrel-forge/minify-images
Simple image compiler including some useful configuration options.
Made to be compatible with node ^10.0.0, might work on higher versions, but current not supported or tested.

## imagemin

npm: [imagemin](https://www.npmjs.com/package/imagemin/v/7.0.1)
Version: 7.0.1
Note: last version compatible with node ^10.0.0

## Installation

```
npm i @squirrel-forge/minify-images

```

All imagemin plugins are optional, to allow for a custom setup if required. Install your required plugins and then use the *--no-optional* flag when installing minify-images. See the [plugins section](#plugins) for compatibility and more information.

## cli usage

If you installed globally with the *-g* option.
```
minify-images target -b --boolean --str=imagemin-webp,imagemin-svgo
minify-images source target -b --boolean --str=imagemin-webp,imagemin-svgo

```

For local installations use *npx* to run the minify-images executable.
```
npx minify-images ...

```

### Arguments

The source argument can be a single file path or folder.
The target argument must be a directory and will be created if it does not exist.

#### Using only one argument

the source argument is omitted and assumed to be the current working directory
1. target - Path to write optimized image files

#### Using two arguments

1. source - Path from where to read, if a directory, files are fetched with following options: ```{ extensions : /\.(gif|jpg|jpeg|png|svg|webp)/ }```
2. target - Path to write optimized image files

### Options

A long option always override the value of a short option if both are used.

 Short | Long         |   Type   | Description
------ | ------------ | -------- | ---
  -x   | --use-webp   |   bool   | Convert to webp format, only jpeg/png
  -p   | --plugins    | str, ... | Define which plugins to use
  -c   | --colors     | str, ... | Define verbose listing color byte limits, must be 3 integers > 0
  -n   | --no-map     |   bool   | Do not use a hashmap, should use this option for single file argument
  -f   | --squash-map |   bool   | Ignore existing map, no map will be loaded and any existing map is replaced
  -o   | --options    | 'no',str | Load options from this path, unless set to 'no', if not set regular checks apply
  -s   | --stats      |   bool   | Show stats output
  -i   | --verbose    |   bool   | Show additional info
  -u   | --loose      |   bool   | Run in loose mode, disables the strict option
  -v   | --version    |   bool   | Show the application version

## Config file

Plugin options can be set by a *.minify-images* json format file containing options objects for each plugin you wish to customize, see following example:

File: *.minify-images*
```
{
  "imagemin-mozjpeg": {
    "quality": 80,
    "progressive": false
  }
  ...
}
```

The config is loaded in following order:

 1. If you specified a config path it will be checked first.
 2. Your current working directory, from where you are running the command usually.
 3. The source root directory, from where the source file or files are loaded.

If none of the above resolve to a valid config, defaults are used.

## Map file

The *.minify-images.map* file is only a json map of paths with file content hashes, see the [options](#options) *-n* and *-f* for more details.

## NPM scripts

When installed locally use following scripts.

```
...
"scripts": {
    "images:publish": "npx minify-images src/img dist/img",
}
...

```

## Api usage

You can require the ImagesCompiler class in your node script and run it, change internal options and extend it easily, look at the cli implementation and code comments to understand what to run in which order, currently there will be no extended documentation on the js api, since code comments should be sufficient to understand what works in which way.

## Plugins

Default plugins that are included as optional dependencies, with some additional notes, can be found below:
 
### imagemin-gifsicle

npm: [imagemin-gifsicle](https://www.npmjs.com/package/imagemin-gifsicle/v/7.0.0)
Version: 7.0.0
Note: upto date version at time of release.

### imagemin-mozjpeg

npm: [imagemin-mozjpeg](https://www.npmjs.com/package/imagemin-mozjpeg/v/9.0.0)
Version: 9.0.0
Note: upto date version at time of release.

### imagemin-pngquant

npm: [imagemin-pngquant](https://www.npmjs.com/package/imagemin-pngquant/v/9.0.2)
Version: 9.0.2
Note: upto date version at time of release.

### imagemin-svgo

npm: [imagemin-svgo](https://www.npmjs.com/package/imagemin-svgo/v/8.0.0)
Version: 8.0.0
Note: last version compatible with node ^10.0.0

### imagemin-webp

npm: [imagemin-webp](https://www.npmjs.com/package/imagemin-webp/v/6.0.0)
Version: 6.0.0
Note: upto date version at time of release.

### Plugin issues

```
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ Moderate      │ Regular Expression Denial of Service (ReDOS)                 │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Package       │ semver-regex                                                 │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Patched in    │ >=3.1.3                                                      │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Dependency of │ imagemin-webp                                                │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Path          │ imagemin-webp > cwebp-bin > bin-wrapper > bin-version-check  │
│               │ > bin-version > find-versions > semver-regex                 │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ More info     │ https://nodesecurity.io/advisories/1005009                   │
└───────────────┴──────────────────────────────────────────────────────────────┘

```
 > in: imagemin-gifsicle, imagemin-mozjpeg, imagemin-pngquant, imagemin-webp

```
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ Moderate      │ Inefficient Regular Expression Complexity in nth-check       │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Package       │ nth-check                                                    │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Dependency of │ imagemin-svgo                                                │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Path          │ imagemin-svgo > svgo > css-select > nth-check                │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ More info     │ https://nodesecurity.io/advisories/1004967                   │
└───────────────┴──────────────────────────────────────────────────────────────┘

```
 > in: imagemin-svgo

```
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ High          │ Regular Expression Denial of Service in trim-newlines        │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Package       │ trim-newlines                                                │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Patched in    │ >=3.0.1                                                      │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Dependency of │ imagemin-webp                                                │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ Path          │ imagemin-webp > cwebp-bin > logalot > squeak > lpad-align >  │
│               │ meow > trim-newlines                                         │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ More info     │ https://nodesecurity.io/advisories/1005151                   │
└───────────────┴──────────────────────────────────────────────────────────────┘

```
 > in: imagemin-webp
