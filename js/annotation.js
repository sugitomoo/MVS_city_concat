// Global configuration
const S3_BASE_URL = 'https://multivideosummarization-city.s3.us-east-1.amazonaws.com/';
const SEGMENTS_DATA_URL = 'https://sugitomoo.github.io/MVS_city_concat/data/segments/';

// Global state
let segmentData = [];
let selections = {};
let totalDuration = 0;
let selectedDuration = 0;
let cityInfo = {};
let currentPlayingSegment = null;

// Preview state
let previewState = {
    isPlaying: false,
    currentIndex: 0,
    queue: [],
    interval: null
};

// Get URL parameters
function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        area: params.get('area'),
        place: params.get('place'),
        city: params.get('city'),
        mode: params.get('mode') || 'standalone',
        assignmentId: params.get('assignmentId')
    };
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    const params = getURLParams();
    
    if (!params.area || !params.place) {
        showError('Missing required parameters. This page should be accessed through AMT interface.');
        return;
    }
    
    cityInfo = {
        area: params.area,
        place: params.place,
        cityName: params.city || params.place,
        mode: params.mode
    };
    
    // Set video source
    const videoPlayer = document.getElementById('concat-video-player');
    videoPlayer.src = `${S3_BASE_URL}concatenate/${cityInfo.area}/${cityInfo.place}/${cityInfo.place}.mp4`;
    
    // Load segments data
    loadSegmentsData();
});

// Load segments data
async function loadSegmentsData() {
    try {
        const response = await fetch(`${SEGMENTS_DATA_URL}${cityInfo.area}/${cityInfo.place}/${cityInfo.place}_segment_all.json`);
        if (!response.ok) throw new Error('Failed to load segments data');
        
        const segmentsJson = await response.json();
        
        // Process segments data
        processSegmentsData(segmentsJson);
        initializeVideo();
    } catch (error) {
        showError('Failed to load segments data: ' + error.message);
    }
}

function updatePreviewButton() {
    const previewButton = document.getElementById('preview-btn');
    const previewButtonBottom = document.getElementById('preview-btn-bottom');
    const disabled = Object.keys(selections).length === 0;
    
    previewButton.disabled = disabled;
    if (previewButtonBottom) {
        previewButtonBottom.disabled = disabled;
    }
}

// Preview functionality
function startPreview() {
    console.log('Starting preview...'); // デバッグ用
    
    // Build preview queue from selected segments in order
    previewState.queue = [];
    
    // Sort segments by segment number to play in order
    const sortedSegments = [...segmentData].sort((a, b) => a.segmentNumber - b.segmentNumber);
    
    sortedSegments.forEach(segment => {
        if (selections[segment.id]) {
            previewState.queue.push({
                segmentId: segment.id,
                segment: segment
            });
        }
    });
    
    console.log('Preview queue:', previewState.queue); // デバッグ用
    
    if (previewState.queue.length === 0) {
        console.log('No segments selected for preview');
        return;
    }
    
    previewState.currentIndex = 0;
    previewState.isPlaying = true;
    
    // Update UI
    document.getElementById('preview-btn').classList.add('hidden');
    const previewButtonBottom = document.getElementById('preview-btn-bottom');
    if (previewButtonBottom) {
        previewButtonBottom.classList.add('hidden');
    }
    document.getElementById('stop-btn').classList.remove('hidden');
    document.getElementById('preview-status').classList.remove('hidden');
    
    // Start playing
    playNextSegment();
}

function playNextSegment() {
    console.log('playNextSegment called, index:', previewState.currentIndex); // デバッグ用
    
    if (!previewState.isPlaying || previewState.currentIndex >= previewState.queue.length) {
        console.log('Preview finished or stopped');
        stopPreview();
        return;
    }
    
    const current = previewState.queue[previewState.currentIndex];
    const player = document.getElementById('concat-video-player');
    
    // Highlight current segment
    clearPreviewHighlights();
    const tile = document.getElementById(`tile-${current.segmentId}`);
    if (tile) tile.classList.add('preview-playing');
    
    // Update status
    document.getElementById('preview-info').textContent = 
        `Segment ${current.segment.segmentNumber + 1} (${previewState.currentIndex + 1}/${previewState.queue.length})`;
    
    // Play segment
    console.log(`Playing from ${current.segment.start} to ${current.segment.end}`);
    player.currentTime = current.segment.start;
    player.play();
    
    // Monitor playback
    if (previewState.interval) clearInterval(previewState.interval);
    previewState.interval = setInterval(() => {
        if (player.currentTime >= current.segment.end || player.paused) {
            console.log('Segment ended at:', player.currentTime);
            clearInterval(previewState.interval);
            previewState.currentIndex++;
            setTimeout(() => playNextSegment(), 500); // Small delay between segments
        }
    }, 100);
}

function stopPreview() {
    console.log('Stopping preview'); // デバッグ用
    previewState.isPlaying = false;
    
    // Clear interval
    if (previewState.interval) {
        clearInterval(previewState.interval);
        previewState.interval = null;
    }
    
    // Pause video
    const player = document.getElementById('concat-video-player');
    if (player) player.pause();
    
    // Clear highlights
    clearPreviewHighlights();
    
    // Update UI
    document.getElementById('preview-btn').classList.remove('hidden');
    const previewButtonBottom = document.getElementById('preview-btn-bottom');
    if (previewButtonBottom) {
        previewButtonBottom.classList.remove('hidden');
    }
    document.getElementById('stop-btn').classList.add('hidden');
    document.getElementById('preview-status').classList.add('hidden');
    
    // Re-highlight current segment if video is still playing
    highlightCurrentSegment();
}

function highlightCurrentSegment() {
    const player = document.getElementById('concat-video-player');
    const currentTime = player.currentTime;
    
    // Find the segment at current time
    const activeSegment = segmentData.find(s => 
        currentTime >= s.start && currentTime <= s.end
    );
    
    // If we're in preview mode, don't interfere with preview highlighting
    if (previewState.isPlaying) return;
    
    // If the active segment hasn't changed, do nothing
    if (activeSegment && currentPlayingSegment && activeSegment.id === currentPlayingSegment.id) {
        return;
    }
    
    // Clear previous highlight
    if (currentPlayingSegment) {
        const prevTile = document.getElementById(`tile-${currentPlayingSegment.id}`);
        if (prevTile) {
            prevTile.classList.remove('currently-playing');
        }
    }
    
    // Highlight new segment
    if (activeSegment) {
        const tile = document.getElementById(`tile-${activeSegment.id}`);
        if (tile) {
            tile.classList.add('currently-playing');
        }
        currentPlayingSegment = activeSegment;
    } else {
        currentPlayingSegment = null;
    }
}

function clearPreviewHighlights() {
    // Clear all preview highlights
    segmentData.forEach(segment => {
        const tile = document.getElementById(`tile-${segment.id}`);
        if (tile) {
            tile.classList.remove('preview-playing');
            // Re-add currently-playing class if this is the current segment
            if (!previewState.isPlaying && currentPlayingSegment && currentPlayingSegment.id === segment.id) {
                tile.classList.add('currently-playing');
            }
        }
    });
}

function processSegmentsData(segmentsJson) {
    const allSegments = segmentsJson[cityInfo.place] || [];
    
    // Process segments
    segmentData = allSegments.map(segment => ({
        id: `segment_${segment.segment_number}`,
        segmentNumber: segment.segment_number,
        start: segment.start,
        end: segment.end,
        duration: segment.duration,
        originalVideo: segment.original_video,
        originalSegmentNumber: segment.original_segment_number
    }));
    
    totalDuration = segmentData.reduce((sum, segment) => sum + segment.duration, 0);
    
    // Update UI
    document.getElementById('total-segments').textContent = segmentData.length;
    createSegmentTiles();
    updateProgress();
    updatePreviewButton();
}

function previewSegment(segmentNumber) {
    const segment = segmentData.find(s => s.segmentNumber === segmentNumber);
    if (!segment) return;
    
    const player = document.getElementById('concat-video-player');
    player.currentTime = segment.start;
    player.play();
    
    const checkTime = setInterval(() => {
        if (player.currentTime >= segment.end) {
            player.pause();
            clearInterval(checkTime);
        }
    }, 100);
}

function createSegmentTiles() {
    const grid = document.getElementById('segments-grid');
    grid.innerHTML = '';
    
    segmentData.forEach(segment => {
        const tile = document.createElement('div');
        tile.className = 'segment-tile';
        tile.id = `tile-${segment.id}`;
        tile.onclick = () => jumpToSegment(segment.segmentNumber);
        
        tile.innerHTML = `
            <div class="segment-number">${segment.segmentNumber + 1}</div>
            <div class="segment-timerange">
                ${formatTime(segment.start)} - ${formatTime(segment.end)}
            </div>
            <button class="segment-include-btn" 
                    onclick="event.stopPropagation(); toggleSegment('${segment.id}')">
                Include
            </button>
        `;
        
        grid.appendChild(tile);
    });
}

function initializeVideo() {
    const player = document.getElementById('concat-video-player');
    
    player.addEventListener('loadedmetadata', function() {
        console.log('Video metadata loaded, duration:', player.duration);
        // total-time要素が削除されたのでこの行は不要
        // document.getElementById('total-time').textContent = formatTime(player.duration);
    });
    
    player.addEventListener('canplay', function() {
        console.log('Video can play');
    });
    
    player.addEventListener('error', function(e) {
        console.error('Video error:', e);
    });
    
    player.addEventListener('timeupdate', function() {
        // updatePlayhead関数は時間表示要素を参照するため、削除またはエラーハンドリングが必要
        // updatePlayhead();
        highlightCurrentSegment();
    });
}

function jumpToSegment(segmentNumber) {
    const segment = segmentData.find(s => s.segmentNumber === segmentNumber);
    if (!segment) return;
    
    const player = document.getElementById('concat-video-player');
    player.currentTime = segment.start;
    player.play().catch(err => {
        console.error('Error playing video:', err);
    });
}

function toggleSegment(segmentId) {
    const segment = segmentData.find(s => s.id === segmentId);
    if (!segment) return;
    
    const tile = document.getElementById(`tile-${segmentId}`);
    const button = tile.querySelector('.segment-include-btn');
    
    if (selections[segmentId]) {
        // Remove selection
        delete selections[segmentId];
        tile.classList.remove('selected');
        button.textContent = 'Include';
        selectedDuration -= segment.duration;
    } else {
        // Add selection
        selections[segmentId] = {
            segmentNumber: segment.segmentNumber,
            originalVideo: segment.originalVideo,
            originalSegmentNumber: segment.originalSegmentNumber,
            duration: segment.duration
        };
        tile.classList.add('selected');
        button.textContent = 'Remove';
        selectedDuration += segment.duration;
    }
    
    updateProgress();
    updatePreviewButton();
}

// updatePlayhead関数を修正（時間表示要素が削除されたため）
function updatePlayhead() {
    // 時間表示要素が削除されたため、この関数は何もしない
    // 必要に応じて他の処理を追加可能
}

function includeCurrentSegment() {
    const player = document.getElementById('concat-video-player');
    const currentTime = player.currentTime;
    
    const segment = segmentData.find(s => 
        currentTime >= s.start && currentTime <= s.end
    );
    
    if (segment) {
        if (!selections[segment.id]) {
            toggleSegment(segment.id);
        }
    } else {
        alert('No segment found at current playback position');
    }
}

function updateProgress() {
    const percentage = totalDuration > 0 ? (selectedDuration / totalDuration * 100) : 0;
    
    // デバッグ用ログ
    console.log('updateProgress called:', {
        selectedDuration: selectedDuration,
        totalDuration: totalDuration,
        percentage: percentage,
        selectionsCount: Object.keys(selections).length
    });
    
    document.getElementById('selected-segments').textContent = Object.keys(selections).length;
    document.getElementById('selected-duration-display').textContent = formatDuration(selectedDuration);
    document.getElementById('percentage-display').textContent = percentage.toFixed(1) + '%';
    
    const percentageBox = document.getElementById('percentage-stat');
    percentageBox.classList.remove('warning', 'success');
    
    if (percentage >= 5 && percentage <= 15) {
        percentageBox.classList.add('success');
    } else {
        percentageBox.classList.add('warning');
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds) {
    if (seconds < 60) {
        return seconds.toFixed(1) + 's';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
}

function saveResults() {
    const percentage = totalDuration > 0 ? (selectedDuration / totalDuration * 100) : 0;
    
    if (percentage < 5 || percentage > 15) {
        const message = `Please select between 5% and 15% of segments.\nCurrent: ${percentage.toFixed(1)}%`;
        
        if (cityInfo.mode === 'amt') {
            window.parent.postMessage({
                type: 'save-error',
                message: message,
                percentage: percentage
            }, '*');
        }
        alert(message);
        return;
    }
    
    // Format results by original video
    const formattedData = {};
    
    // Group selections by original video
    segmentData.forEach(segment => {
        const originalVideo = segment.originalVideo;
        
        if (!formattedData[originalVideo]) {
            formattedData[originalVideo] = {};
        }
        
        // Check if this segment is selected
        if (selections[segment.id]) {
            formattedData[originalVideo][`segment_${segment.originalSegmentNumber}`] = 1;
        } else {
            formattedData[originalVideo][`segment_${segment.originalSegmentNumber}`] = 0;
        }
    });
    
    const results = {
        city: cityInfo.cityName,
        area: cityInfo.area,
        place: cityInfo.place,
        selections: formattedData,
        total_segments: segmentData.length,
        selected_segments: Object.keys(selections).length,
        percentage: percentage,
        timestamp: new Date().toISOString(),
        concatenated_view: true
    };
    
    console.log('Saving results:', results); // デバッグ用
    
    if (cityInfo.mode === 'amt') {
        window.parent.postMessage({
            type: 'results-saved',
            results: results
        }, '*');
    } else {
        downloadResults(results);
        alert('Results saved successfully!');
    }
}

function downloadResults(results) {
    const dataStr = JSON.stringify(results, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${cityInfo.cityName}_concat_results_${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

function showError(message) {
    const container = document.querySelector('.main-container');
    container.innerHTML = `
        <div style="background: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; text-align: center;">
            <h3>Error</h3>
            <p>${message}</p>
        </div>
    `;
}

// Make functions globally available
window.jumpToSegment = jumpToSegment;
window.toggleSegment = toggleSegment;
window.includeCurrentSegment = includeCurrentSegment;
window.saveResults = saveResults;
window.startPreview = startPreview;
window.stopPreview = stopPreview;

// AMT message handling
if (window.location.search.includes('mode=amt')) {
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'save-request') {
            saveResults();
        }
    });
}