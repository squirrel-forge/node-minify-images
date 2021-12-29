/**
 * Requires
 */
const path = require( 'path' );
const sizeOf = require( 'image-size' );
const { cfx } = require( '@squirrel-forge/node-cfx' );
const { CliInput, Progress, Timer, leadingZeros, convertBytes, StatsDisplay } = require( '@squirrel-forge/node-util' );
const ImageCompiler = require( './classes/ImageCompiler' );

/**
 * Build Scss cli application
 * @return {Promise<void>} - Possibly throws errors in strict mode
 */
module.exports = async function cli() {

    // Timer
    const timer = new Timer();

    // Input
    const input = new CliInput( cfx );

    // Main arguments
    let source = input.arg( 0 ) || '',
        target = input.arg( 1 ) || '';
    if ( !target.length ) {
        target = source;
        source = '';
    }

    // Cli application options
    const options = input.getFlagsOptions( {

        // Show version
        version : [ '-v', '--version', false, true ],

        // Show stats output
        stats : [ '-s', '--stats', false, true ],

        // Show more output
        verbose : [ '-i', '--verbose', false, true ],

        // Convert to webp format
        webp : [ '-x', '--use-webp', false, true ],

        // Use webp format
        plugins : [ '-p', '--plugins', '', false ],

        // Color limits
        colors : [ '-c', '--colors', '', false ],

        // Run without map mode
        nomap : [ '-n', '--no-map', false, true ],

        // Force replace map, only has an effect when in map mode
        squash : [ '-f', '--squash-map', false, true ],

        // Set options source directory
        options : [ '-o', '--options', true, false ],

        // Run in parallel mode
        parallel : [ '-l', '--parallel', false, true ],

        // Do not break on any error, disables the default strict if set
        loose : [ '-u', '--loose', null, true ],

    } );

    // Show version
    if ( options.version ) {
        const install_dir = path.resolve( __dirname, '../' );
        let pkg;
        try {
            pkg = require( path.join( install_dir, 'package.json' ) );
        } catch ( e ) {
            cfx.error( e );
            process.exit( 1 );
        }
        cfx.log( pkg.name + '@' + pkg.version );
        cfx.info( '- Installed at: ' + install_dir );
        process.exit( 0 );
    }

    // Init application
    const imgC = new ImageCompiler( cfx );

    // Set minify and sourcemap options
    if ( options.loose ) {
        imgC.strict = false;
    }
    imgC.verbose = options.verbose;

    // Set map options
    imgC.options.map = !options.nomap;
    imgC.options.squash = options.squash;

    // Enable webp conversion
    if ( options.webp ) {
        imgC.plugins = [ 'imagemin-gifsicle', 'imagemin-svgo', 'imagemin-webp' ];
    }

    // Plugins option must be an Array
    if ( !( options.plugins instanceof Array ) ) {
        options.plugins = options.plugins.split( ',' )
            .filter( ( v ) => { return !!v.length; } );
    }
    if ( options.plugins.length ) {
        imgC.plugins = options.plugins;
    }

    // Disable plugin options file
    if ( input._f.includes( options.options ) ) {

        // Load no options
        imgC.options.optionsPath = false;

    } else if ( options.options && options.options.length ) {

        // Set as options path
        imgC.options.optionsPath = options.options;
    }

    // Color warning option must be an Array
    if ( !( options.colors instanceof Array ) ) {
        options.colors = options.colors.split( ',' )
            .filter( ( v ) => { return !!v.length; } )
            .map( ( x ) => { return parseInt( x, 10 ) * 1024; } );
    }

    // Use default color if not enough defined
    if ( options.colors.length !== 3 ) {

        // Notify user if something is defined
        if ( options.verbose && options.colors.length ) {
            cfx.info( 'Using default coloring, [fwhite]-c[fcyan] or [fwhite]--colors'
                + ' [fcyan]must contain 3 incrementing kib limit integers' );
        }

        // Set default coloring limits
        options.colors = [ 150 * 1024, 250 * 1024, 400 * 1024 ];
    }
    const [ mark_green, mark_yellow, mark_red ] = options.colors;

    // Notify strict mode
    if ( imgC.strict && imgC.verbose ) {
        cfx.warn( 'Running in strict mode!' );
    }

    // Init progress spinner, stats and count
    const spinner = new Progress();
    const stDi = new StatsDisplay( cfx );
    let file_count = 1;

    /**
     * Get file stats data as array
     * @param {Object} file - File object
     * @return {Array<string>} - Styled file stats parts
     */
    const getFileStats = ( file ) => {
        const output = [];

        // Show size saved percent
        let percent_color = 'none';
        if ( file.percent < 10 ) {
            percent_color = 'error';
        } else if ( file.percent < 25 ) {
            percent_color = 'notice';
        } else if ( file.percent > 40 ) {
            percent_color = 'valid';
        }
        output.push( '- ' + stDi.show( [ leadingZeros( file.percent, 7, ' ' ) + '% ', percent_color ], true ) );

        // Make extra stats output
        if ( options.stats ) {

            // Begin bracket block
            output.push( '[fred][[re]' );

            // Size details
            output.push( stDi.show( [ [
                [ leadingZeros( file.dimensions.width, 4, ' ' ), 'number' ],
                'x',
                [ leadingZeros( file.dimensions.height, 4, ' ' ), 'number' ],
            ], 'asline' ], true ) );

            // Show type and transform
            const fromtype = file.source_type.mime || file.source_type.ext;
            const totype = file.target_type.mime || file.target_type.ext;
            if ( fromtype !== totype ) {

                // Show type conversion, happens when using the webp module
                output.push( '[fwhite]' + leadingZeros( fromtype, 10, ' ' )
                    + ' [fmagenta]->[fwhite] ' + leadingZeros( totype, 10, ' ' ) );
            } else {

                // Show output type
                output.push( '[fwhite]' + leadingZeros( totype, options.webp ? 24 : 13, ' ' ) );
            }

            // Show output size
            let size_color = 'none';
            if ( file.target_size <= mark_green ) {
                size_color = 'valid';
            } else if ( file.target_size <= mark_yellow ) {
                size_color = 'notice';
            } else if ( file.target_size > mark_red ) {
                size_color = 'error';
            }
            output.push( stDi.show( [ leadingZeros( convertBytes( file.target_size ), 11, ' ' ) + ' ', size_color ], true ) );

            // Time to process
            output.push( leadingZeros( stDi.show( [ file.time.process, 'time' ], true ), 35, ' ' ) );

            // End bracket block
            output.push( '[fred]]' );
        }

        // Relative to root path
        output.push( stDi.show( [ file.target.rel, 'path' ], true ) );
        return output;
    };

    /**
     * Fetch stats from file
     * @param {Object} file - File object
     * @param {Object} stats - Stats object
     * @param {ImageCompiler} compiler - Builder instance
     * @return {void}
     */
    const statsFetcher = ( file, stats, compiler ) => {

        // Stop the spinner, is updated with process count after output
        compiler.strict && spinner.stop();

        if ( !file.dimensions && ( compiler.verbose || options.stats ) ) {
            file.dimensions = sizeOf( file.source.path );
        }

        // Generate informational output if requested
        if ( compiler.verbose ) {
            cfx.info( getFileStats( file ).join( ' ' ) );
        }

        // Start the spinner with a count of the files processed
        const new_spinner = 'Optimized ('
            + ( leadingZeros( file_count, ( stats.sources + '' ).length, ' ' ) + '/' + stats.sources )
            + ')... ';
        compiler.strict && spinner.start( new_spinner );
        file_count++;
    };

    // Begin processing
    if ( imgC.verbose ) {
        cfx.info( 'Reading from: ' + stDi.show( [ path.resolve( source ), 'path' ], true ) );
    }
    imgC.strict && spinner.start( 'Optimizing... ' );
    let stats;
    try {

        // Run render, process and write
        stats = await imgC.run( source, target, options.parallel, null, statsFetcher );
    } catch ( e ) {
        imgC.strict && spinner.stop();

        // Generate cleaner exception output only full trace on verbose
        const error = new ImageCompiler.ImageCompilerException( 'Something went wrong', e );
        imgC.error( imgC._exceptionAsOutput( error, !imgC.verbose ) );
        process.exit( 1 );
    }

    // If we did not crash, stop spinner and inform user
    imgC.strict && spinner.stop();

    // Output result info
    if ( !stats.written ) {
        if ( stats.sources ) {

            // We have sources but it seems nothing was written
            if ( imgC.options.map ) {
                cfx.success( 'minify-images did not find any changes according to map' );
                if ( options.verbose ) {
                    cfx.info( 'Use the [fwhite]-f [fcyan]or [fwhite]--squash-map [fcyan]flag to ignore any existing map' );
                }
            } else {
                cfx.warn( 'minify-images did not write any files!' );
            }
        } else {

            // Warn user since there were no sources detected
            cfx.error( 'minify-images did not find any files!' );
        }
        if ( imgC.verbose ) {
            cfx.info( 'Completed after [fwhite]' + timer.end( 'construct' ) );
        }
    } else {
        if ( imgC.verbose ) {
            cfx.info( 'Wrote to: ' + stDi.show( [ path.resolve( target ), 'path' ], true ) );
        }

        // Show a few details at least when something was written
        cfx.success( 'minify-images wrote [ ' + stats.written + ' ] file' + ( stats.written === 1 ? '' : 's' )
            + ' and saved [ ' + stats.size.percent + '% ] in ' + timer.end( 'construct' ) );
    }

    // Generate stats on request only
    if ( options.stats ) {
        const so = {
            Overview : {
                Files : [ [ 'Sources:', stats.sources ], 'asline' ],
                Compression : [ [
                    'Source:', [ stats.size.source, 'bytes' ],
                    'Processed:', [ stats.size.target, 'bytes' ],
                    'Saved:', [ stats.size.percent, 'percent' ],
                ], 'asline' ],
                Time : [ stats.time, 'time' ],
            },
        };
        if ( stats.sources !== stats.processed ) {
            so.Overview.Files[ 0 ].push( 'Processed:' );
            so.Overview.Files[ 0 ].push( stats.processed );
        }
        if ( stats.sources !== stats.written ) {
            so.Overview.Files[ 0 ].push( 'Wrote:' );
            so.Overview.Files[ 0 ].push( stats.written );
        }
        if ( stats.skipped ) {
            so.Overview.Files[ 0 ].push( 'Skipped:' );
            so.Overview.Files[ 0 ].push( stats.skipped );
        }
        if ( stats.options ) {
            so.Overview[ 'Options loaded from' ] = [ stats.options, 'path' ];
        }
        if ( stats.hashmap && !options.nomap && !options.squash ) {
            so.Overview[ 'Hashmap loaded from' ] = [ stats.hashmap, 'path' ];
        }
        if ( !options.verbose ) {
            const files_prop = 'Files with possible issues';
            for ( let i = 0; i < stats.files.length; i++ ) {
                const file = stats.files[ i ];
                const conditions = [

                    // Target size is above highest limit
                    file.target_size > mark_red,

                    // Compression less than 10%, target size not optimal and not an svg
                    file.percent < 10 && !( file.target_size <= mark_green )
                        && !( file.target_type.mime === 'image/svg+xml' || file.target_type.ext === '.svg' ),

                    // Target size not optimal and large dimensions
                    file.target_size > mark_green
                        && ( file.dimensions.width > 840 || file.dimensions.height > 840 ),
                ];
                if ( conditions.some( ( v ) => { return v; } ) ) {
                    if ( !so[ files_prop ] ) so[ files_prop ] = [];
                    so[ files_prop ].push( [ getFileStats( file ).join( ' ' ), 'none' ] );
                }
            }
        }

        // Show generated stats
        stDi.display( so );
    }

    // End application
    process.exit( 0 );
};
