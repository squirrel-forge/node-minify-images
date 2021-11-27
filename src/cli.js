/**
 * Requires
 */
const path = require( 'path' );
const { cfx } = require( '@squirrel-forge/node-cfx' );
const { CliInput, Progress, isPojo, leadingZeros, convertBytes } = require( '@squirrel-forge/node-util' );
const ImageCompiler = require( './classes/ImageCompiler' );

/**
 * Build Scss cli application
 * @return {Promise<void>} - Possibly throws errors in strict mode
 */
module.exports = async function cli() {

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

        // Show more output
        stats : [ '-s', '--stats', false, true ],

        // Show more output
        verbose : [ '-i', '--verbose', false, true ],

        // Generate map
        map : [ '-m', '--map', false, true ],

        // Squash map
        squash : [ '-x', '--squash-map', false, true ],

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
    imgC.options.map = options.map;
    imgC.options.squash = options.squash;

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
        const rel_path =  file.rel !== '.' ? file.rel + path.sep : '';
        const file_name = file.target.name + file.target.ext;
        compiler.strict && spinner.stop();
        if ( compiler.verbose && typeof file.percent !== 'undefined' ) {
            cfx.info( '- [fwhite]' + leadingZeros( file.percent, 5, ' ' ) + '%'
                + ' [fcyan][[fwhite]' + leadingZeros( convertBytes( file.target_size ), 12, ' ' ) + '[fcyan]]'
                + ' [fcyan]' + path.sep + rel_path + '[fwhite]' + file_name
            );
        }
        const new_spinner = 'Optimized ('
            + ( leadingZeros( file_count, ( stats.sources + '' ).length, ' ' ) + '/' + stats.sources )
            + ')... ';
        compiler.strict && spinner.start( new_spinner );
        file_count++;
        return true;
    };

    // Begin processing
    imgC.strict && spinner.start( 'Optimizing... ' );

    // Load defined imagemin plugins
    imgC.loadPlugins();

    // Run render, process and write
    const stats = await imgC.run( source, target, statsFetcher );

    // Output result info
    imgC.strict && spinner.stop();
    if ( !stats.written ) {
        cfx.warn( 'minify-images did not write any files!' );
    } else {
        cfx.success( 'minify-images wrote ' + stats.written + ' file' + ( stats.written === 1 ? '' : 's' )
            + ' and saved ' + stats.size.percent + ' %' );
    }

    // Generate stats on request only
    if ( options.stats ) {
        const entries = Object.entries( stats );
        for ( let i = 0; i < entries.length; i++ ) {
            const [ key, value ] = entries[ i ];
            let display_value = value, complex_value;
            switch ( typeof value ) {
            case 'object' :
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
                cfx.info( ' - ' + key + display_value );
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
                                    colored_k = '[fgreen]' + cmplx_k;
                                    break;
                                case 'failed' :
                                    colored_k = '[fred]' + cmplx_k;
                                    break;
                                default :
                                    colored_k = '[fwhite]' + cmplx_k;
                                }
                                cfx.info( ' - ' + colored_k );
                                for ( let k = 0; k < cmplx_v.length; k++ ) {
                                    cfx.log( '   - ' + cmplx_v[ k ] );
                                }
                            }
                        } else {
                            cfx.info( ' - ' + cmplx_k + '.' + key + ': [fwhite]' + cmplx_v
                                + ( cmplx_k === 'percent' ? ' %'
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
