/**
 * Ckmeans algorithm
 *
 * Much of the code that lies within was taken from the simple-statistics library,
 * which offers a javascript implementation of the ckmeans algorithm originally
 * designed by Haizhou Wang and Mingzhou Song
 *
 * https://cran.r-project.org/web/packages/Ckmeans.1d.dp/
 * https://github.com/simple-statistics/simple-statistics
 *
 * The simple-statistics software license is included below
 *
 * --
 *
 * ISC License
 *
 * Copyright (c) 2014, Tom MacWright
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */

function numericSort(array) {
  return (
    array
      // ensure the array is not changed in-place
      .slice()
      // comparator function that treats input as numeric
      .sort(function (a, b) {
        return a - b;
      })
  );
}

function uniqueCountSorted(input) {
  var uniqueValueCount = 0;
  var lastSeenValue;
  for (var i = 0; i < input.length; i++) {
    if (i === 0 || input[i] !== lastSeenValue) {
      lastSeenValue = input[i];
      uniqueValueCount++;
    }
  }
  return uniqueValueCount;
}

function makeMatrix(columns, rows) {
  var matrix = [];
  for (var i = 0; i < columns; i++) {
    var column = [];
    for (var j = 0; j < rows; j++) {
      column.push(0);
    }
    matrix.push(column);
  }
  return matrix;
}

function ssq(j, i, sumX, sumXsq) {
  var sji; // s(j, i)
  if (j > 0) {
    var muji = (sumX[i] - sumX[j - 1]) / (i - j + 1); // mu(j, i)
    sji = sumXsq[i] - sumXsq[j - 1] - (i - j + 1) * muji * muji;
  } else {
    sji = sumXsq[i] - (sumX[i] * sumX[i]) / (i + 1);
  }
  return sji < 0 ? 0 : sji;
}

function fillMatrixColumn(imin, imax, column, matrix, backtrackMatrix, sumX, sumXsq) {
  if (imin > imax) {
    return;
  }

  // Start at midpoint between imin and imax
  var i = Math.floor((imin + imax) / 2);

  // Initialization of S[k][i]:
  matrix[column][i] = matrix[column - 1][i - 1];
  backtrackMatrix[column][i] = i;

  var jlow = column; // the lower end for j

  if (imin > column) {
    jlow = Math.max(jlow, backtrackMatrix[column][imin - 1] || 0);
  }
  jlow = Math.max(jlow, backtrackMatrix[column - 1][i] || 0);

  var jhigh = i - 1; // the upper end for j
  if (imax < matrix[0].length - 1) {
    jhigh = Math.min(jhigh, backtrackMatrix[column][imax + 1] || 0);
  }

  var sji;
  var sjlowi;
  var ssqjlow;
  var ssqj;
  for (var j = jhigh; j >= jlow; --j) {
    // compute s(j,i)
    sji = ssq(j, i, sumX, sumXsq);

    // MS May 11, 2016 Added:
    if (sji + matrix[column - 1][jlow - 1] >= matrix[column][i]) {
      break;
    }

    // Examine the lower bound of the cluster border
    // compute s(jlow, i)
    sjlowi = ssq(jlow, i, sumX, sumXsq);

    ssqjlow = sjlowi + matrix[column - 1][jlow - 1];

    if (ssqjlow < matrix[column][i]) {
      // shrink the lower bound
      matrix[column][i] = ssqjlow;
      backtrackMatrix[column][i] = jlow;
    }
    jlow++;

    ssqj = sji + matrix[column - 1][j - 1];
    if (ssqj < matrix[column][i]) {
      matrix[column][i] = ssqj;
      backtrackMatrix[column][i] = j;
    }
  }

  fillMatrixColumn(imin, i - 1, column, matrix, backtrackMatrix, sumX, sumXsq);
  fillMatrixColumn(i + 1, imax, column, matrix, backtrackMatrix, sumX, sumXsq);
}

function fillMatrices(data, matrix, backtrackMatrix) {
  var nValues = matrix[0]?.length || 0;
  var sumX = new Array(nValues);
  var sumXsq = new Array(nValues);

  // Use the median to shift values of x to improve numerical stability
  var shift = data[Math.floor(nValues / 2)];

  // Initialize first row in matrix & backtrackMatrix
  for (var i = 0; i < nValues; ++i) {
    if (i === 0) {
      sumX[0] = data[0] - shift;
      sumXsq[0] = (data[0] - shift) * (data[0] - shift);
    } else {
      sumX[i] = sumX[i - 1] + data[i] - shift;
      sumXsq[i] = sumXsq[i - 1] + (data[i] - shift) * (data[i] - shift);
    }

    // Initialize for k = 0
    matrix[0][i] = ssq(0, i, sumX, sumXsq);
    backtrackMatrix[0][i] = 0;
  }

  // Initialize the rest of the columns
  var imin;
  for (var k = 1; k < matrix.length; ++k) {
    if (k < matrix.length - 1) {
      imin = k;
    } else {
      // No need to compute matrix[K-1][0] ... matrix[K-1][N-2]
      imin = nValues - 1;
    }

    fillMatrixColumn(imin, nValues - 1, k, matrix, backtrackMatrix, sumX, sumXsq);
  }
}

/**
 * Ckmeans clustering is an improvement on heuristic-based clustering
 * approaches like Jenks. The algorithm was developed in
 * [Haizhou Wang and Mingzhou Song](http://journal.r-project.org/archive/2011-2/RJournal_2011-2_Wang+Song.pdf)
 * as a [dynamic programming](https://en.wikipedia.org/wiki/Dynamic_programming) approach
 * to the problem of clustering numeric data into groups with the least
 * within-group sum-of-squared-deviations.
 *
 * Minimizing the difference within groups - what Wang & Song refer to as
 * `withinss`, or within sum-of-squares, means that groups are optimally
 * homogenous within and the data is split into representative groups.
 * This is very useful for visualization, where you may want to represent
 * a continuous variable in discrete color or style groups. This function
 * can provide groups that emphasize differences between data.
 *
 * Being a dynamic approach, this algorithm is based on two matrices that
 * store incrementally-computed values for squared deviations and backtracking
 * indexes.
 *
 * Unlike the [original implementation](https://cran.r-project.org/web/packages/Ckmeans.1d.dp/index.html),
 * this implementation does not include any code to automatically determine
 * the optimal number of clusters: this information needs to be explicitly
 * provided.
 *
 * ### References
 * _Ckmeans.1d.dp: Optimal k-means Clustering in One Dimension by Dynamic
 * Programming_ Haizhou Wang and Mingzhou Song ISSN 2073-4859
 *
 * from The R Journal Vol. 3/2, December 2011
 * @param {Array<number>} data input data, as an array of number values
 * @param {number} nClusters number of desired classes. This cannot be
 * greater than the number of values in the data array.
 * @returns {Array<Array<number>>} clustered input
 * @example
 * ckmeans([-1, 2, -1, 2, 4, 5, 6, -1, 2, -1], 3);
 * // The input, clustered into groups of similar numbers.
 * //= [[-1, -1, -1, -1], [2, 2, 2], [4, 5, 6]]);
 */
function ckmeans(data, nClusters) {
  if (nClusters > data.length) {
    console.log('Ckmeans cannot generate more classes than there are data values')
    return []
    //throw new Error('Cannot generate more classes than there are data values');
  }

  var nValues = data.length;

  var sorted = numericSort(data);
  // we'll use this as the maximum number of clusters
  var uniqueCount = uniqueCountSorted(sorted);

  // if all of the input values are identical, there's one cluster
  // with all of the input in it.
  if (uniqueCount === 1) {
    return [sorted[0]];
  }
  nClusters = Math.min(uniqueCount, nClusters);

  // named 'S' originally
  var matrix = makeMatrix(nClusters, nValues);
  // named 'J' originally
  var backtrackMatrix = makeMatrix(nClusters, nValues);

  // This is a dynamic programming way to solve the problem of minimizing
  // within-cluster sum of squares. It's similar to linear regression
  // in this way, and this calculation incrementally computes the
  // sum of squares that are later read.
  fillMatrices(sorted, matrix, backtrackMatrix);

  // The real work of Ckmeans clustering happens in the matrix generation:
  // the generated matrices encode all possible clustering combinations, and
  // once they're generated we can solve for the best clustering groups
  // very quickly.
  var clusters = [];
  var clusterRight = (backtrackMatrix[0]?.length || 0) - 1 ;

  // Backtrack the clusters from the dynamic programming matrix. This
  // starts at the bottom-right corner of the matrix (if the top-left is 0, 0),
  // and moves the cluster target with the loop.
  for (var cluster = backtrackMatrix.length - 1; cluster >= 0; cluster--) {
    var clusterLeft = backtrackMatrix[cluster][clusterRight];

    // fill the cluster from the sorted input by taking a slice of the
    // array. the backtrack matrix makes this easy - it stores the
    // indexes where the cluster should start and end.
    clusters[cluster] = sorted[clusterLeft];

    if (cluster > 0) {
      clusterRight = clusterLeft - 1;
    }
  }

  return clusters;
}



export default ckmeans

// # [Jenks natural breaks optimization](http://en.wikipedia.org/wiki/Jenks_natural_breaks_optimization)
//
// Implementations: [1](http://danieljlewis.org/files/2010/06/Jenks.pdf) (python),
// [2](https://github.com/vvoovv/djeo-jenks/blob/master/main.js) (buggy),
// [3](https://github.com/simogeo/geostats/blob/master/lib/geostats.js#L407) (works)
export function jenksBreaks(data, n_classes) {

    // Compute the matrices required for Jenks breaks. These matrices
    // can be used for any classing of data with `classes <= n_classes`
    function getMatrices(data, n_classes) {

        // in the original implementation, these matrices are referred to
        // as `LC` and `OP`
        //
        // * lower_class_limits (LC): optimal lower class limits
        // * variance_combinations (OP): optimal variance combinations for all classes
        var lower_class_limits = [],
            variance_combinations = [],
            // loop counters
            i, j,
            // the variance, as computed at each step in the calculation
            variance = 0;

        // Initialize and fill each matrix with zeroes
        for (i = 0; i < data.length + 1; i++) {
            var tmp1 = [], tmp2 = [];
            for (j = 0; j < n_classes + 1; j++) {
                tmp1.push(0);
                tmp2.push(0);
            }
            lower_class_limits.push(tmp1);
            variance_combinations.push(tmp2);
        }

        for (i = 1; i < n_classes + 1; i++) {
            lower_class_limits[1][i] = 1;
            variance_combinations[1][i] = 0;
            // in the original implementation, 9999999 is used but
            // since Javascript has `Infinity`, we use that.
            for (j = 2; j < data.length + 1; j++) {
                variance_combinations[j][i] = Infinity;
            }
        }

        for (var l = 2; l < data.length + 1; l++) {

            // `SZ` originally. this is the sum of the values seen thus
            // far when calculating variance.
            var sum = 0,
                // `ZSQ` originally. the sum of squares of values seen
                // thus far
                sum_squares = 0,
                // `WT` originally. This is the number of
                w = 0,
                // `IV` originally
                i4 = 0;

            // in several instances, you could say `Math.pow(x, 2)`
            // instead of `x * x`, but this is slower in some browsers
            // introduces an unnecessary concept.
            for (var m = 1; m < l + 1; m++) {

                // `III` originally
                var lower_class_limit = l - m + 1,
                    val = data[lower_class_limit - 1];

                // here we're estimating variance for each potential classing
                // of the data, for each potential number of classes. `w`
                // is the number of data points considered so far.
                w++;

                // increase the current sum and sum-of-squares
                sum += val;
                sum_squares += val * val;

                // the variance at this point in the sequence is the difference
                // between the sum of squares and the total x 2, over the number
                // of samples.
                variance = sum_squares - (sum * sum) / w;

                i4 = lower_class_limit - 1;

                if (i4 !== 0) {
                    for (j = 2; j < n_classes + 1; j++) {
                        // if adding this element to an existing class
                        // will increase its variance beyond the limit, break
                        // the class at this point, setting the lower_class_limit
                        // at this point.
                        if (variance_combinations[l][j] >=
                            (variance + variance_combinations[i4][j - 1])) {
                            lower_class_limits[l][j] = lower_class_limit;
                            variance_combinations[l][j] = variance +
                                variance_combinations[i4][j - 1];
                        }
                    }
                }
            }

            lower_class_limits[l][1] = 1;
            variance_combinations[l][1] = variance;
        }

        // return the two matrices. for just providing breaks, only
        // `lower_class_limits` is needed, but variances can be useful to
        // evaluage goodness of fit.
        return {
            lower_class_limits: lower_class_limits,
            variance_combinations: variance_combinations
        };
    }



    // the second part of the jenks recipe: take the calculated matrices
    // and derive an array of n breaks.
    function breaks(data, lower_class_limits, n_classes) {

        var k = data.length - 1,
            kclass = [],
            countNum = n_classes;

        // the calculation of classes will never include the upper and
        // lower bounds, so we need to explicitly set them
        kclass[n_classes] = data[data.length - 1];
        kclass[0] = data[0];

        // the lower_class_limits matrix is used as indexes into itself
        // here: the `k` variable is reused in each iteration.
        while (countNum > 1) {
            kclass[countNum - 1] = data[lower_class_limits[k][countNum] - 2];
            k = lower_class_limits[k][countNum] - 1;
            countNum--;
        }

        return kclass;
    }

    if (n_classes > data.length) return null;

    // sort data in numerical order, since this is expected
    // by the matrices function
    data = data.slice().sort(function (a, b) { return a - b; });

    // get our basic matrices
    var matrices = getMatrices(data, n_classes),
        // we only need lower class limits here
        lower_class_limits = matrices.lower_class_limits;

    // extract n_classes out of the computed matrices
    return breaks(data, lower_class_limits, n_classes);

}

export function equalIntervalBreaks(x, nClasses) {
    if (x.length < 2) {
        return x;
    }

    const theMin = Math.min(...x);
    const theMax = Math.max(...x);

    // the first break will always be the minimum value
    // in the xset
    const breaks = [theMin];

    // The size of each break is the full range of the x
    // divided by the number of classes requested
    const breakSize = (theMax - theMin) / nClasses;

    // In the case of nClasses = 1, this loop won't run
    // and the returned breaks will be [min, max]
    for (let i = 1; i < nClasses; i++) {
        breaks.push(breaks[0] + breakSize * i);
    }

    // the last break will always be the
    // maximum.
    breaks.push(theMax);

    return breaks;
}



export function prettyBreaks(data, classes) {

     const minimum = Math.min(...data);
    const maximum = Math.max(...data);

    let breaks = [];

    if ( classes < 1 ) {
        breaks.push( maximum );
        return breaks;
    }

    let minimumCount = parseInt(classes / 3 );
    let shrink = 0.75;
    let highBias = 1.5;
    let adjustBias = 0.5 + 1.5 * highBias;
    let divisions = parseInt( classes );
    let h = highBias;
    let cell;
    let small = false;
    let dx = maximum - minimum;

    if (NearTo( dx, 0.0 ) && NearTo( maximum, 0.0 )) {
        cell = 1.0;
        small = true;
    } else {
        let U = 1;
        cell = (Math.abs(maximum) >= Math.abs(minimum)) ? Math.abs(maximum) : Math.abs(minimum);
        if ( adjustBias >= 1.5 * h + 0.5) {
            U = parseInt( 1 + (1.0 / (1 + h)) );
        } else {
            U = parseInt( 1 + ( 1.5 / ( 1 + adjustBias ) ) );
        }
        let maxBetweenDivisions = (1 >= divisions) ? 1 : divisions;
        small = dx < ( cell * U * maxBetweenDivisions * 1e-07 * 3.0 );
    }

    if (small) {
        if (cell > 10) {
            cell = 9 + cell / 10;
            cell = cell * shrink;
        }
        if (minimumCount > 1) {
            cell = cell / minimumCount;
        }
    } else {
        cell = dx;
        if (divisions > 1) {
            cell = cell / divisions;
        }
    }

    if (cell < 20 * 1e-07) {
        cell = 20 * 1e-07;
    }

    let base = Math.pow(10.0, Math.floor( Math.log10( cell )));
    let unit = base;

    if ( ( 2 * base ) - cell < h * ( cell - unit ) ) {
        unit = 2.0 * base;
        if ( ( 5 * base ) - cell < adjustBias * ( cell - unit ) )
        {
          unit = 5.0 * base;
          if ( ( 10.0 * base ) - cell < h * ( cell - unit ) )
          {
            unit = 10.0 * base;
          }
        }
    }

    let start = parseInt( Math.floor( minimum / unit + 1e-07 ) );
    let end = parseInt( Math.ceil( maximum / unit - 1e-07 ) );

    // Extend the range out beyond the data. Does this ever happen??
    while ( start * unit > minimum + ( 1e-07 * unit ) ) {
        start = start - 1;
    }
    while ( end * unit < maximum - ( 1e-07 * unit ) ) {
        end = end + 1;
    }

    let k = parseInt( Math.floor( 0.5 + end - start ) );
    if ( k < minimumCount ) {
        k = minimumCount - k;
        if ( start >= 0 ) {
            end = end + k / 2;
            start = start - k / 2 + k % 2;
        }
        else {
            start = start - k / 2;
            end = end + k / 2 + k % 2;
        }
    }
    let minimumBreak = start * unit;
    let count = parseInt( end - start );

    breaks = [];
    for ( let i = 1; i < count + 1; i++ ) {
        breaks.push( minimumBreak + i * unit );
    }

    if ( breaks.length === 0 ) return breaks;

    if ( breaks[0] < minimum ) {
        breaks.splice(0, 1, minimum);
    }
    if ( breaks[breaks.length-1] > maximum ) {
        breaks.splice(breaks.length-1, 1, maximum);
    }

    if ( minimum < 0.0 && maximum > 0.0 ) { //then there should be a zero somewhere 
        let breaksMinusZero = []; // compute difference "each break - 0"
        for ( let i = 0; i <= breaks.length; i++ ) {
            breaksMinusZero.push( breaks[i] - 0.0 );
        }
        let posOfMin = 0;
        for ( let i = 1; i <= breaks.length; i++ ) { // find position of minimal difference
            if ( Math.abs( breaksMinusZero[i] ) < Math.abs( breaksMinusZero[i - 1] ) )
            posOfMin = i;
        }
        breaks[posOfMin] = 0.0;
    }

    return breaks;
};



/** Check if value1 is nearest to value2 */
function NearTo(value1, value2) {
    if (value1 > 1 || value2 > 1) return false;
    else if ((value1 >= 0 && value1 < 1 ) && (value2 >= 0 && value2 < 1 )) return true;
    else return false;
};