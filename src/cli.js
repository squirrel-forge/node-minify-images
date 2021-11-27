/**
 * Requires
 */
const path = require( 'path' );
const { cfx } = require( '@squirrel-forge/node-cfx' );
const { CliInput, Progress, Timer, isPojo, leadingZeros, convertBytes } = require( '@squirrel-forge/node-util' );
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

        // Generate map
        nomap : [ '-m', '--no-map', false, true ],

        // Force replace map
        squash : [ '-f', '--squash-map', false, true ],

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
                + ' [fcyan]must contain 3 incrementing byte limit integers' );
        }

        // Set default coloring limits
        options.colors = [ 150 * 1024, 300 * 1024, 500 * 1024 ];
    }
    const [ mark_green, mark_yellow, mark_red ] = options.colors;

    // Notify strict mode
    if ( imgC.strict && imgC.verbose ) {
        cfx.warn( 'Running in strict mode!' );
    }

    // Init progress spinner and start count
    const spinner = new Progress();
    let file_count = 1;

    /**
     * Fetch stats from file
     * @param {Object} file - File object
     * @param {Object} stats - Stats object
     * @param {ImageCompiler} compiler - Builder instance
     * @return {boolean} - Write file, always true
     */
    const statsFetcher = ( file, stats, compiler ) => {

        // Stop the spinner, is updated with process count after output
        compiler.strict && spinner.stop();

        // Generate informational output if requested and file was processed
        if ( compiler.verbose && file.buffer ) {

            // Show size saved percent
            const output = [ '- [fwhite]' + leadingZeros( file.percent, 5, ' ' ) + '%' ];

            // Make extra stats output
            if ( options.stats ) {

                // Begin bracket block
                output.push( '[fcyan][[fwhite]' );
                const fromtype = file.source_type.mime || file.source_type.ext;
                const totype = file.target_type.mime || file.target_type.ext;
                if ( fromtype !== totype ) {

                    // Show type conversion, happens when using the webp module
                    output.push( leadingZeros( fromtype, 11, ' ' )
                        + ' [fcyan]>[fwhite] ' + leadingZeros( totype, 13, ' ' ) );
                } else {

                    // Show output type
                    output.push( leadingZeros( totype, options.webp ? 27 : 14, ' ' ) );
                }

                // Show output size
                let size_color = '';
                if ( file.target_size <= mark_green ) {
                    size_color = '[fgreen]';
                } else if ( file.target_size <= mark_yellow ) {
                    size_color = '[fyellow]';
                } else if ( file.target_size > mark_red ) {
                    size_color = '[fred]';
                }
                output.push( size_color + leadingZeros( convertBytes( file.target_size ), 11, ' ' ) );

                // Time to process
                output.push( '[fwhite]' + leadingZeros( timer.end( 'process-' + file_count ), 14, ' ' ) );

                // End bracket block
                output.push( '[fcyan]]' );
            }

            // Relative to root path
            output.push( '[fcyan]' + path.sep + ( file.rel !== '.' ? file.rel + path.sep : '' )
                + '[fwhite]' + file.target.name + file.target.ext );

            // Show as one output message
            cfx.info( output.join( ' ' ) );
        }

        // Start the spinner with a count of the files processed
        const new_spinner = 'Optimized ('
            + ( leadingZeros( file_count, ( stats.sources + '' ).length, ' ' ) + '/' + stats.sources )
            + ')... ';
        compiler.strict && spinner.start( new_spinner );
        file_count++;
        timer.start( 'process-' + file_count );

        // Always write, we are just collecting stats
        return true;
    };

    // Begin processing
    imgC.strict && spinner.start( 'Optimizing... ' );
    let stats;
    try {

        // Load defined imagemin plugins
        imgC.loadPlugins();

        // Run render, process and write
        timer.start( 'process-' + file_count );
        stats = await imgC.run( source, target, statsFetcher );
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
            if ( imgC.options.map ) {
                cfx.success( 'minify-images did not find any changes according to map' );
                if ( options.verbose ) {
                    cfx.info( 'Use the [fwhite]-f [fcyan]or [fwhite]--squash-map [fcyan]flag to ignore any existing map' );
                }
            } else {
                cfx.warn( 'minify-images did not write any files!' );
            }
        } else {
            cfx.error( 'minify-images did not find any files!' );
        }
        if ( imgC.verbose ) {
            cfx.info( 'Completed after [fwhite]' + timer.end( 'construct' ) );
        }
    } else {
        cfx.success( 'minify-images wrote [ ' + stats.written + ' ] file' + ( stats.written === 1 ? '' : 's' )
            + ' and saved [ ' + stats.size.percent + '% ] in ' + timer.end( 'construct' ) );
    }

    // Generate stats on request only
    if ( options.stats ) {
        cfx.log( '[fmagenta][ [fwhite]Stats [fmagenta]][re]' );
        const entries = Object.entries( stats );
        for ( let i = 0; i < entries.length; i++ ) {
            const [ key, value ] = entries[ i ];
            let display_value = value, complex_value;
            switch ( typeof value ) {
            case 'object' :
                if ( value === null ) {
                    continue;
                }
                complex_value = value;
                display_value = '';
                break;
            case 'number' :
                display_value = ': [fwhite]' + display_value;
                break;
            default :
                display_value = ' [fwhite]' + display_value;
            }
            if ( !complex_value ) {
                cfx.info( '- ' + key + display_value );
            }
            if ( complex_value ) {
                if ( isPojo( complex_value ) ) {
                    const cmplx_entries = Object.entries( complex_value );
                    for ( let j = 0; j < cmplx_entries.length; j++ ) {
                        const [ cmplx_k, cmplx_v ] = cmplx_entries[ j ];
                        if ( cmplx_v instanceof Array ) {
                            if ( cmplx_v.length ) {
                                let colored_k;
                                switch ( cmplx_k ) {
                                case 'created' :
                                    colored_k = '[fgreen]' + cmplx_k
                                        + ' director' + ( cmplx_v.length === 1 ? 'y' : 'ies' ) + ':';
                                    break;
                                case 'failed' :
                                    colored_k = '[fred]' + cmplx_k
                                        + ' director' + ( cmplx_v.length === 1 ? 'y' : 'ies' ) + ':';
                                    break;
                                default :
                                    colored_k = '[fwhite]' + cmplx_k;
                                }
                                cfx.info( '- ' + colored_k );
                                for ( let k = 0; k < cmplx_v.length; k++ ) {
                                    cfx.info( '  - [fwhite]' + cmplx_v[ k ] );
                                }
                            }
                        } else {
                            cfx.info( '- ' + cmplx_k + '.' + key + ': [fwhite]' + cmplx_v
                                + ( cmplx_k === 'percent' ? '%'
                                    : ' [fcyan]([fwhite]' + convertBytes( cmplx_v ) + '[fcyan])' ) );
                        }
                    }
                }
            }
        }
    }

    // End application
    process.exit( 0 );
};
