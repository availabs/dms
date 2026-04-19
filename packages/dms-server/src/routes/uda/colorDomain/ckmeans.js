/**
 * Ckmeans — optimal 1-D k-means clustering via dynamic programming.
 *
 * Ported from simple-statistics (ISC license, Tom MacWright, 2014) via
 * the legacy avail-falcor controller. Returns `n` breakpoints that
 * minimize within-cluster sum of squared deviations.
 *
 * For input of length n with k clusters, runtime is O(k·n²). Feed bounded
 * samples (e.g., histogram-expanded representatives) — unbounded input is
 * not viable on large datasets.
 *
 * https://cran.r-project.org/web/packages/Ckmeans.1d.dp/
 * https://github.com/simple-statistics/simple-statistics
 */

function numericSort(array) {
  return array.slice().sort((a, b) => a - b);
}

function uniqueCountSorted(input) {
  let uniqueValueCount = 0;
  let lastSeenValue;
  for (let i = 0; i < input.length; i++) {
    if (i === 0 || input[i] !== lastSeenValue) {
      lastSeenValue = input[i];
      uniqueValueCount++;
    }
  }
  return uniqueValueCount;
}

function makeMatrix(columns, rows) {
  const matrix = [];
  for (let i = 0; i < columns; i++) {
    const col = new Array(rows).fill(0);
    matrix.push(col);
  }
  return matrix;
}

function ssq(j, i, sumX, sumXsq) {
  let sji;
  if (j > 0) {
    const muji = (sumX[i] - sumX[j - 1]) / (i - j + 1);
    sji = sumXsq[i] - sumXsq[j - 1] - (i - j + 1) * muji * muji;
  } else {
    sji = sumXsq[i] - (sumX[i] * sumX[i]) / (i + 1);
  }
  return sji < 0 ? 0 : sji;
}

function fillMatrixColumn(imin, imax, column, matrix, backtrackMatrix, sumX, sumXsq) {
  if (imin > imax) return;

  const i = Math.floor((imin + imax) / 2);
  matrix[column][i] = matrix[column - 1][i - 1];
  backtrackMatrix[column][i] = i;

  let jlow = column;
  if (imin > column) jlow = Math.max(jlow, backtrackMatrix[column][imin - 1] || 0);
  jlow = Math.max(jlow, backtrackMatrix[column - 1][i] || 0);

  let jhigh = i - 1;
  if (imax < matrix[0].length - 1) jhigh = Math.min(jhigh, backtrackMatrix[column][imax + 1] || 0);

  for (let j = jhigh; j >= jlow; --j) {
    const sji = ssq(j, i, sumX, sumXsq);
    if (sji + matrix[column - 1][jlow - 1] >= matrix[column][i]) break;

    const sjlowi = ssq(jlow, i, sumX, sumXsq);
    const ssqjlow = sjlowi + matrix[column - 1][jlow - 1];
    if (ssqjlow < matrix[column][i]) {
      matrix[column][i] = ssqjlow;
      backtrackMatrix[column][i] = jlow;
    }
    jlow++;

    const ssqj = sji + matrix[column - 1][j - 1];
    if (ssqj < matrix[column][i]) {
      matrix[column][i] = ssqj;
      backtrackMatrix[column][i] = j;
    }
  }

  fillMatrixColumn(imin, i - 1, column, matrix, backtrackMatrix, sumX, sumXsq);
  fillMatrixColumn(i + 1, imax, column, matrix, backtrackMatrix, sumX, sumXsq);
}

function fillMatrices(data, matrix, backtrackMatrix) {
  const nValues = matrix[0]?.length || 0;
  const sumX = new Array(nValues);
  const sumXsq = new Array(nValues);
  const shift = data[Math.floor(nValues / 2)];

  for (let i = 0; i < nValues; ++i) {
    if (i === 0) {
      sumX[0] = data[0] - shift;
      sumXsq[0] = (data[0] - shift) * (data[0] - shift);
    } else {
      sumX[i] = sumX[i - 1] + data[i] - shift;
      sumXsq[i] = sumXsq[i - 1] + (data[i] - shift) * (data[i] - shift);
    }
    matrix[0][i] = ssq(0, i, sumX, sumXsq);
    backtrackMatrix[0][i] = 0;
  }

  let imin;
  for (let k = 1; k < matrix.length; ++k) {
    imin = k < matrix.length - 1 ? k : nValues - 1;
    fillMatrixColumn(imin, nValues - 1, k, matrix, backtrackMatrix, sumX, sumXsq);
  }
}

/**
 * @param {number[]} data Numeric values (will be sorted; original unchanged).
 * @param {number} nClusters Number of clusters; coerced to `uniqueCount` if larger.
 * @returns {number[]} Lower bounds of each cluster, length = min(nClusters, uniqueCount).
 */
function ckmeans(data, nClusters) {
  if (!Array.isArray(data) || data.length === 0) return [];
  if (nClusters > data.length) return [];

  const nValues = data.length;
  const sorted = numericSort(data);
  const uniqueCount = uniqueCountSorted(sorted);

  if (uniqueCount === 1) return [sorted[0]];
  nClusters = Math.min(uniqueCount, nClusters);

  const matrix = makeMatrix(nClusters, nValues);
  const backtrackMatrix = makeMatrix(nClusters, nValues);
  fillMatrices(sorted, matrix, backtrackMatrix);

  const clusters = [];
  let clusterRight = (backtrackMatrix[0]?.length || 0) - 1;
  for (let cluster = backtrackMatrix.length - 1; cluster >= 0; cluster--) {
    const clusterLeft = backtrackMatrix[cluster][clusterRight];
    clusters[cluster] = sorted[clusterLeft];
    if (cluster > 0) clusterRight = clusterLeft - 1;
  }
  return clusters;
}

module.exports = { ckmeans };
