/**
 * Requires
 */
const path = require( 'path' );
const crypto = require( 'crypto' );
const imagemin = require( 'imagemin' );
const fileType = require( 'file-type' );
const { Exception, FsInterface, Timer, isPojo, round } = require( '@squirrel-forge/node-util' );

/**
 * ImageCompiler exception
 * @class
 */
class ImageCompilerException extends Exception {}

/**
 * ImageCompiler class
 * @class
 * @type {ImageCompiler}
 */
class ImageCompiler {

    /**
     * Constructor
     * @constructor
     * @param {null|console} cfx - Console or alike object
     */
    constructor( cfx = null ) {

        /**
         * Timer
         * @public
         * @property
         * @type {Timer}
         */
        this.timer = new Timer();

        /**
         * Console alike reporting object
         * @protected
         * @property
         * @type {console|null}
         */
        this._cfx = cfx;

        /**
         * Strict mode
         * @public
         * @property
         * @type {boolean}
         */
        this.strict = true;

        /**
         * Verbose mode
         * Outputs the full stack of nonfatal exceptions
         * @public
         * @property
         * @type {boolean}
         */
        this.verbose = true;

        /**
         * Plugins to load by default
         * @public
         * @property
         * @type {string[]}
         */
        this.plugins = [ 'imagemin-gifsicle', 'imagemin-mozjpeg', 'imagemin-pngquant', 'imagemin-svgo' ];

        /**
         * Imagemin options
         * @public
         * @property
         * @type {Object}
         */
        this.options = {
            map : true,
            squash : false,
            mapName : '.minify-images.map',
            optionsPath : null,
            optionsName : '.minify-images',
            plugins : {},
        };

        /**
         * List of loaded plugin names
         * @protected
         * @property
         * @type {string[]}
         */
        this._loaded = [];

        /**
         * Plugins with applied options
         * @protected
         * @property
         * @type {Function[]}
         */
        this._plugins = [];

        /**
         * Loaded map data
         * @protected
         * @property
         * @type {Object}
         */
        this._map = {};
    }

    /**
     * Parse exception for output
     * @protected
     * @param {string|Error|Exception} msg - Message or exception instance
     * @param {boolean} noTrace - Do not output trace since it is internal
     * @return {string} - Exception output
     */
    _exceptionAsOutput( msg, noTrace = false ) {

        // We check if its an exception, all other errors will be sent to output unmodified
        if ( msg instanceof Error ) {
            if ( this.verbose && !noTrace ) {

                // In verbose we want to whole stack
                return msg.stack;
            } else {

                // In normal mode we just send the short string representation without the stack
                return msg + '';
            }
        }
        return msg;
    }

    /**
     * Error output
     *  Throw in strict mode or always true
     *  Notify in normal mode
     *  Show full trace in verbose mode
     * @public
     * @param {string|Error|Exception} msg - Message or exception instance
     * @param {boolean} always - Fatal error, always throw
     * @throws {Exception}
     * @return {void}
     */
    error( msg, always = false ) {

        // In strict mode we always throw
        if ( always || this.strict ) {
            throw msg;
        }

        // If we are not silent and we have a fitting error logger
        if ( this._cfx && typeof this._cfx.error === 'function' ) {
            this._cfx.error( this._exceptionAsOutput( msg ) );
        }
    }

    /**
     * Resolve source
     * @protected
     * @param {string} source - Source path
     * @return {Promise<{root: string, files: string[], source, resolved: string}>} - Source object
     */
    async _resolveSource( source ) {

        // Resolve source
        const resolved = path.resolve( source );

        // Require valid source
        const source_exists = await FsInterface.exists( resolved );
        if ( !source_exists ) {
            throw new ImageCompilerException( 'Source not found: ' + resolved );
        }

        // Convert to array for processing
        let files = [ resolved ], root = resolved;

        // Fetch files if source is a directory
        if ( FsInterface.isDir( resolved ) ) {
            files = FsInterface.fileList( resolved, { extensions : /\.(gif|jpg|jpeg|png|svg|webp)/ } );

            // Require file results
            if ( !files.length ) {
                throw new ImageCompilerException( 'Source is empty: ' + resolved );
            }
        } else {
            root = path.dirname( resolved );
        }

        return { root, source, resolved, files };
    }

    /**
     * Resolve target
     * @protected
     * @param {string} target - Target source
     * @return {Promise<{created: null, exists: boolean, target, resolved: string}>} - Target object
     */
    async _resolveTarget( target ) {

        // Resolve target
        const resolved = path.resolve( target );

        // Attempt create
        let created = null, exists = await FsInterface.exists( resolved );
        if ( !exists ) {
            created = await FsInterface.dir( resolved );
            exists = true;
        }

        // Check for directory if not created
        if ( !created && !FsInterface.isDir( resolved ) ) {
            throw new ImageCompilerException( 'Target must be a directory: ' + resolved );
        }
        return { target, resolved, exists, created };
    }

    /**
     * Get path data
     * @protected
     * @param {string} file - File path
     * @param {null|string} ext - File extension change
     * @param {null|string} rel - Relative path
     * @return {{ext: string, name: string, dir: string}} - Path data
     */
    _getPathData( file, ext = null, rel = null ) {
        const data = {
            dir : path.dirname( file ),
            name : path.basename( file, path.extname( file ) ),
            ext : ext || path.extname( file ),
        };
        data.path = ext ? path.join( data.dir, data.name + data.ext ) : file;
        data.rel = '.' + path.sep + ( rel && rel !== '.' ? rel + path.sep : '' )
            + data.name + data.ext;
        return data;
    }

    /**
     * Get file data
     * @protected
     * @param {string} file - File path
     * @param {Object} source - Source object
     * @param {Object} target - Target object
     * @param {null|string} ext - File extension change
     * @return {Object} - File data
     */
    _getFileData( file, source, target, ext = null ) {
        const target_path = path.join( target.resolved, FsInterface.relative2root( file, source.root ) );
        const rel_path = path.dirname( FsInterface.relative2root( target_path, target.resolved ) );
        return {
            source_root : source.root,
            target_root : target.resolved,
            rel : rel_path,
            source : this._getPathData( file, null, rel_path ),
            target : this._getPathData( target_path, ext, rel_path ),
            hash : null,
            buffer : null,
            source_type : null,
            target_type : null,
            time : {
                total : null,
                read : null,
                process : null,
                write : null,
            },
            errors : [],
        };
    }

    /**
     * Load plugins from list
     * @public
     * @param {Array<string>} plugins - Plugins
     * @return {void}
     */
    loadPlugins( plugins = null ) {
        if ( !plugins ) {
            plugins = this.plugins || [];
        }
        for ( let i = 0; i < plugins.length; i++ ) {
            this.loadPlugin( plugins[ i ] );
        }
    }

    /**
     * Load plugin
     * @public
     * @param {string} module - Module name
     * @return {void}
     */
    loadPlugin( module ) {
        if ( this._loaded.includes( module )  ) {
            this.error( new ImageCompilerException( 'Plugin already defined: ' + module ) );
            return;
        }
        const options = this.options.plugins[ module ] || {};
        try {
            this._plugins.push( require( module )( options ) );
            this._loaded.push( module );
        } catch ( e ) {
            this.error( new ImageCompilerException( 'Plugin not installed: ' + module, e ) );
        }
    }

    /**
     * Check if this explicit image has been optimized already
     * @protected
     * @param {Object} data - File data
     * @return {boolean} - True if should optimize
     */
    _shouldOptimize( data ) {
        if ( this.options.map ) {
            const name = path.join( data.rel, data.source.name + data.source.ext );
            if ( this._map[ name ] === data.hash ) {
                return false;
            }
            this._map[ name ] = data.hash;
        }
        return true;
    }

    /**
     * Get type of buffer
     * @param {Buffer} buf - Buffer
     * @param {Object} file - File object
     * @return {Promise<null|{ext:string,mime:string}>} - Type object or null if not detected
     */
    async typeOfBuffer( buf, file ) {
        let type = await fileType.fromBuffer( buf );

        // Failed to detect type
        if ( !isPojo( type ) ) {
            type = { ext : file.source.ext.substr( 1 ), mime : null };

            // Assume/guess mime
            switch ( type.ext ) {
            case 'jpg' :
                type.mime = 'image/jpeg';
                break;
            case 'svg' :
                type.mime = 'image/svg+xml';
                break;
            default :
                type.mime = 'image/' + type.ext;
            }
        }

        // Assume svg if extension is declared as xml or source is svg
        if ( type && type.ext === 'xml' || file.source.ext === '.svg' ) {
            type.ext = 'svg';
            type.mime = 'image/svg+xml';
        }
        return type;
    }

    /**
     * Optimize image file
     * @protected
     * @param {Object} data - File object
     * @param {Object} stats - Stats object
     * @param {Object} source - Source object
     * @param {Object} target - Target object
     * @return {Promise<void>} - May throw exceptions
     */
    async _optimizeFile( data, stats, source, target ) {

        // Read file
        this.timer.start( 'read-' + data.source.path );
        const buf = await FsInterface.read( data.source.path, null );
        if ( buf instanceof Error ) {
            throw buf;
        }
        data.source_type = await this.typeOfBuffer( buf, data );
        data.source_size = Buffer.byteLength( buf );
        if ( this.options.map ) {
            data.hash = crypto.createHash( 'sha256' ).update( buf ).digest( 'hex' );
        }
        data.time.read = this.timer.measure( 'read-' + data.source.path );

        // After read and optimize decision callback
        const optimize = this._shouldOptimize( data );

        // Skip optimize and save some time
        if ( !optimize ) {
            stats.skipped++;
            return;
        }

        // Optimize
        this.timer.start( 'process-' + data.source.path );
        data.buffer = await imagemin.buffer( buf, { plugins : this._plugins } );
        data.target_size = Buffer.byteLength( data.buffer );
        data.target_type = await this.typeOfBuffer( data.buffer, data );
        if ( data.source_type.mime !== data.target_type.mime ) {
            const new_data = this._getFileData( data.source.path, source, target, '.' + data.target_type.ext );
            data.target = new_data.target;
        }
        const percent = 100 - data.target_size / data.source_size * 100;
        const decimals = Math.pow( 10, 2 );
        data.percent = Math.round( percent * decimals ) / decimals;
        stats.size.source += data.source_size;
        stats.size.target += data.target_size;
        data.time.process = this.timer.measure( 'process-' + data.source.path );
    }

    /**
     * Require directory
     * @protected
     * @param {string} require_dir - Path that is required
     * @param {Object} stats - Stats object
     * @return {Promise<boolean>} - True if directory is available
     */
    async _requireDirectory( require_dir, stats ) {

        // Check if the dir was recently created and only process if not
        const exists = await FsInterface.exists( require_dir );
        if ( !stats.dirs.created.includes( require_dir ) && ( !exists || !FsInterface.isDir( require_dir ) ) ) {
            let created = null, error;
            try {

                // Attempt to create
                created = await FsInterface.dir( require_dir );
            } catch ( e ) {
                error = e;
            }

            // An error was returned
            if ( error || created !== true ) {
                this.error( new ImageCompilerException( 'Failed to create directory: ' + require_dir, error || created ) );

                // Remember the fail, all images in this dir will be skipped
                if ( !stats.dirs.failed.includes( require_dir ) ) {
                    stats.dirs.failed.push( require_dir );
                }
                return false;
            }

            // Remember we created it
            if ( !stats.dirs.created.includes( require_dir ) ) {
                stats.dirs.created.push( require_dir );
            }
        }
        return true;
    }

    /**
     * Load sourcemap from root directory
     * @protected
     * @param {Object} source Source obejct
     * @return {Promise<string>} - Map path
     */
    async _loadMap( source ) {
        if ( this.options.map ) {
            const map_path = path.join( source.root, this.options.mapName );
            if ( !this.options.squash ) {
                const exists = await FsInterface.exists( map_path );
                if ( exists ) {
                    let map = null;
                    try {
                        map = await FsInterface.readJSON( map_path );
                    } catch ( e ) {
                        this.error( new ImageCompilerException( 'Failed to read hashmap at: ' + map_path, e ) );
                        return map_path;
                    }
                    if ( map && isPojo( map ) ) {
                        this._map = map;
                    }
                }
            }
            return map_path;
        }
        return null;
    }

    /**
     * Load plugins config
     * @protected
     * @param {Object} source - Source object
     * @return {Promise<string|null>} - Loaded path or null on empty
     */
    async _loadPluginsConfig( source ) {
        let data = null, from = null;

        // Prioritize from options if available
        if ( this.options.optionsPath && this.options.optionsPath.length ) {
            const from_options = path.join( this.options.optionsPath, this.options.optionsName );
            const options_exists = await FsInterface.exists( from_options );
            if ( options_exists ) {
                data = await FsInterface.readJSON( from_options );
                from = from_options;
            }
        }

        // Only attempt further loading if not disabled
        if ( !data && this.options.optionsPath !== false ) {

            // Check current working directory
            const from_cwd = path.join( process.cwd(), this.options.optionsName );
            const cwd_exists = await FsInterface.exists( from_cwd );
            if ( cwd_exists ) {

                // Config loaded from cwd
                data = await FsInterface.readJSON( from_cwd );
                from = from_cwd;
            } else {

                // Check source root directory
                const from_source = path.join( source.root, this.options.optionsName );
                const source_exists = await FsInterface.exists( from_source );
                if ( source_exists ) {

                    // Config loaded form source root
                    data = await FsInterface.readJSON( from_source );
                    from = from_source;
                }
            }
        }

        // Assign config if one is loaded and not empty
        if ( data && isPojo( data ) && Object.keys( data ).length ) {
            Object.assign( this.options.plugins, data );
        }

        // Return origin
        return from;
    }

    /**
     * Process file
     * @protected
     * @param {string} file_path - File path
     * @param {Object} source - Source object
     * @param {Object} target - Target object
     * @param {Object} stats - Stats object
     * @param {null|Function} allowrite - Before write callback
     * @param {null|Function} complete - Complete callback
     * @return {Promise<void>} - May throw errors
     */
    async _processFile( file_path, source, target, stats, allowrite = null, complete = null ) {
        this.timer.start( 'total-' + file_path );
        const file = this._getFileData( file_path, source, target );
        stats.files.push( file );

        // Attempt to optimize
        try {
            await this._optimizeFile( file, stats, source, target );
            if ( file && file.buffer ) {
                stats.processed++;
            }
        } catch ( e ) {
            const error = new ImageCompilerException( 'Optimize failed for: ' + file_path, e );
            file.errors.push( error );
            this.error( error );
        }

        // Stats and write decision callback
        let write = true;
        if ( file && typeof allowrite === 'function' ) {
            write = await allowrite( file, stats, this );
        }

        // Skip along if no write or file available
        if ( !write || !file || !file.buffer ) {
            return;
        }
        this.timer.start( 'write-' + file.source.path );

        // Make sure the target directory exists
        if ( file.rel !== '.' ) {
            const require_dir = path.join( file.target_root, file.rel );
            const available_or_created = await this._requireDirectory( require_dir, stats );
            if ( !available_or_created ) {

                // Skip this file since we cant write it
                // in strict mode _requireDirectory will have thrown an exception already
                return;
            }
        }

        // Write the compressed image file
        const wrote = await FsInterface.write( file.target.path, file.buffer );
        file.time.write = this.timer.measure( 'write-' + file.source.path );
        if ( !wrote ) {
            const error = new ImageCompilerException( 'Failed to write: ' + file.target.path );
            file.errors.push( error );
            this.error( error );
        } else {
            stats.written++;
        }
        delete file.buffer;
        file.time.total = this.timer.measure( 'total-' + file_path );

        // Complete callback
        if ( file && typeof complete === 'function' ) {
            await complete( file, stats, this );
        }
    }

    /**
     * Process files in parallel
     * @protected
     * @param {Object} source - Source object
     * @param {Object} target - Target object
     * @param {Object} stats - Stats object
     * @param {null|Function} allowrite - Before write callback
     * @param {null|Function} complete - Complete callback
     * @return {Promise<void[]>} - May throw errors
     */
    _processParallel( source, target, stats, allowrite = null, complete = null ) {
        const parallel = [];
        for ( let i = 0; i < source.files.length; i++ ) {
            parallel.push( this._processFile( source.files[ i ], source, target, stats, allowrite, complete ) );
        }
        return Promise.all( parallel );
    }

    /**
     * Process source files
     * @protected
     * @param {Object} source - Source object
     * @param {Object} target - Target object
     * @param {Object} stats - Stats object
     * @param {boolean} parallel - Run optimize for all files in parallel
     * @param {null|Function} allowrite - Before write callback
     * @param {null|Function} complete - Complete callback
     * @return {Promise<void>} - May throw errors
     */
    async _processSource( source, target, stats, parallel = false, allowrite = null, complete = null ) {
        if ( parallel ) {
            await this._processParallel( source, target, stats, allowrite, complete );
        } else {

            // Process each file in order, one at a time, takes longer but does not stress your machine
            for ( let i = 0; i < source.files.length; i++ ) {
                await this._processFile( source.files[ i ], source, target, stats, allowrite, complete );
            }
        }
    }

    /**
     * Run build
     * @param {string} source - Source path
     * @param {string} target - Target path
     * @param {boolean} parallel - Run optimize for all files in parallel
     * @param {null|Function} allowrite - Before write callback
     * @param {null|Function} complete - Complete callback
     * @return {Promise<Object>} - Stats
     */
    async run( source, target, parallel = false, allowrite = null, complete = null ) {
        this.timer.start( 'total-run' );

        // Get source and target definitions
        source = await this._resolveSource( source );
        target = await this._resolveTarget( target );

        // Basic stats object
        const stats = {
            sources : source.files.length,
            processed : 0,
            written : 0,
            skipped : 0,
            files : [],
            time : null,
            size : {
                source : 0,
                target : 0,
                percent : 0,
            },
            dirs : {
                created : [],
                failed : [],
            },
        };

        // Load plugin options file
        stats.options = await this._loadPluginsConfig( source );

        // Load hash map of optimized images
        stats.hashmap = await this._loadMap( source );

        // Load defined imagemin plugins
        this.loadPlugins();

        // Run file list and optimize
        await this._processSource( source, target, stats, parallel, allowrite, complete );

        // Update hashmap if option is on and path is available
        if ( this.options.map && stats.hashmap ) {
            await FsInterface.write( stats.hashmap, JSON.stringify( this._map ) );
        }

        // Calculate overall percent reduction
        if ( stats.size.source && stats.size.target ) {
            stats.size.percent = round( 100 - stats.size.target / stats.size.source * 100 );
        }
        stats.time = this.timer.measure( 'total-run' );

        // End and return stats
        return stats;
    }
}

// Export Exception as static property constructor
ImageCompiler.ImageCompilerException = ImageCompilerException;
module.exports = ImageCompiler;
