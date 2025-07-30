// Global configuration
const S3_BASE_URL = 'https://multivideosummarization-city.s3.us-east-1.amazonaws.com/';
const SEGMENTS_DATA_URL = 'https://sugitomoo.github.io/MVS_city_concat/data/segments/';

// Global state
const segmentData = {};
const selections = {};
let totalDuration = 0;
let selectedDuration = 0;
let videoMetadata = {};
let cityInfo = {};

// Preview state for each video
const videoPreviewState = {};

// Get URL parameters
function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        area: params.get('area'),
        place: params.get('place'),
        city: params.get('city'),
        videos: params.get('videos') ? params.get('videos').split(',') : [],
        mode: params.get('mode') || 'standalone',
        assignmentId: params.get('assignmentId')
    };
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    const params = getURLParams();
    
    if (!params.area || !params.place || params.videos.length === 0) {
        showError('Missing required parameters. This page should be accessed through AMT interface.');
        return;
    }
    
    cityInfo = {
        area: params.area,
        place: params.place,
        cityName: params.city || params.place,
        videoIds: params.videos,
        mode: params.mode
    };
    
    // Load segments data
    loadSegmentsData();
});

// Load segments data from GitHub Pages
async function loadSegmentsData() {
    try {
        const response = await fetch(`${SEGMENTS_DATA_URL}${cityInfo.area}/${cityInfo.place}/${cityInfo.place}_segment.json`);
        if (!response.ok) throw new Error('Failed to load segments data');
        
        const segmentsJson = await response.json();
        
        // Process segments data and create videos
        createVideoElements(segmentsJson);
        initializeSegments(segmentsJson);
        initializeVideos();
    } catch (error) {
        showError('Failed to load segments data: ' + error.message);
    }
}

function createVideoElements(segmentsJson) {
    const videosSection = document.getElementById('videos-section');
    videosSection.innerHTML = '';
    
    cityInfo.videoIds.forEach((videoId, index) => {
        if (!segmentsJson[videoId]) return;
        
        const videoNum = index + 1;
        const videoUrl = `${S3_BASE_URL}${cityInfo.area}/${cityInfo.place}/${videoId}.mp4`;
        
        // Initialize preview state for this video
        videoPreviewState[`video${videoNum}`] = {
            isPlaying: false,
            currentIndex: 0,
            queue: [],
            interval: null
        };
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `video${videoNum}-container`;
        
        // Create segment tiles HTML
        const segmentTilesHtml = segmentsJson[videoId].map(segment => `
            <div class='segment-tile' 
                 data-segment-id='video${videoNum}_s${segment.segment_number}'
                 data-segment-number='${segment.segment_number}'
                 data-start='${segment.start}'
                 data-end='${segment.end}'
                 data-duration='${segment.duration}'
                 onclick='jumpToSegment("video${videoNum}", ${segment.segment_number})'>
                <div class='segment-number'>${segment.segment_number + 1}</div>
                <div class='segment-timerange'>
                    <div>${formatTime(segment.start)}</div>
                    <div>-</div>
                    <div>${formatTime(segment.end)}</div>
                </div>
                <button class='segment-include-btn' 
                        onclick='event.stopPropagation(); toggleSegment("video${videoNum}_s${segment.segment_number}", "video${videoNum}", ${segment.segment_number})'>
                    Include
                </button>
            </div>
        `).join('');
        
        videoContainer.innerHTML = `
            <div class="segment-viewer">
                <video class="video-player" id="video${videoNum}-player" controls>
                    <source src="${videoUrl}" type="video/mp4">
                </video>
                
                <div class="video-progress-container" id="v${videoNum}-progress-container" onclick="seekVideo(event, 'video${videoNum}')">
                    <div class="video-progress-bar" id="v${videoNum}-progress-bar"></div>
                    <div id="v${videoNum}-segment-blocks"></div>
                    <div class="playhead" id="v${videoNum}-playhead" style="left: 0%;"></div>
                </div>
                <div class="time-labels">
                    <span id="v${videoNum}-current-time">0:00</span>
                    <button class="include-current-btn" onclick="includeCurrentSegment('video${videoNum}')">Include Current Segment</button>
                    <span id="v${videoNum}-total-time">0:00</span>
                </div>
                
                <!-- Video-specific preview controls -->
                <div class="video-controls">
                    <button class="video-preview-button" id="preview-btn-video${videoNum}" onclick="startVideoPreview('video${videoNum}')" disabled>
                        <span>▶</span> Preview
                    </button>
                    <button class="video-stop-button hidden" id="stop-btn-video${videoNum}" onclick="stopVideoPreview('video${videoNum}')">
                        <span>■</span> Stop
                    </button>
                </div>
            </div>
            
            <div class="segments-container">
                <div class="segments-grid" id="v${videoNum}-segments">
                    ${segmentTilesHtml}
                </div>
            </div>
        `;
        
        videosSection.appendChild(videoContainer);
    });
}

function initializeSegments(segmentsJson) {
    cityInfo.videoIds.forEach((videoId, index) => {
        const videoNum = index + 1;
        const videoKey = `video${videoNum}`;
        segmentData[videoKey] = [];
        
        if (segmentsJson[videoId]) {
            segmentsJson[videoId].forEach(segment => {
                const segmentObj = {
                    id: `${videoKey}_s${segment.segment_number}`,
                    videoId: videoKey,
                    youtubeId: videoId,
                    segmentNumber: segment.segment_number,
                    start: segment.start,
                    end: segment.end,
                    duration: segment.duration
                };
                segmentData[videoKey].push(segmentObj);
                totalDuration += segment.duration;
            });
        }
    });
    
    document.getElementById('total-segments').textContent = 
        Object.values(segmentData).reduce((sum, segments) => sum + segments.length, 0);
    
    updateProgress();
}

function initializeVideos() {
    Object.keys(segmentData).forEach(videoId => {
        const player = document.getElementById(`${videoId}-player`);
        if (!player) return;
        
        player.addEventListener('loadedmetadata', function() {
            videoMetadata[videoId] = {
                duration: player.duration
            };
            
            const videoNum = videoId.replace('video', '');
            document.getElementById(`v${videoNum}-total-time`).textContent = 
                formatTime(player.duration);
            
            createProgressBarSegments(videoId);
        });
        
        player.addEventListener('canplay', function() {
            if (player.duration && !document.getElementById(`v${videoId.replace('video', '')}-segment-blocks`).hasChildNodes()) {
                videoMetadata[videoId] = {
                    duration: player.duration
                };
                createProgressBarSegments(videoId);
            }
        });
        
        player.addEventListener('timeupdate', function() {
            updatePlayhead(videoId);
        });
    });
}

function createProgressBarSegments(videoId) {
    const videoNum = videoId.replace('video', '');
    const container = document.getElementById(`v${videoNum}-segment-blocks`);
    container.innerHTML = '';
    
    const segments = segmentData[videoId];
    const videoDuration = videoMetadata[videoId]?.duration || 0;
    
    if (!segments || segments.length === 0 || videoDuration === 0) return;
    
    segments.forEach(segment => {
        const block = document.createElement('div');
        block.className = 'segment-block unselected';
        block.id = `progress-block-${segment.id}`;
        block.style.left = `${(segment.start / videoDuration) * 100}%`;
        block.style.width = `${(segment.duration / videoDuration) * 100}%`;
        block.textContent = segment.segmentNumber + 1;
        block.onclick = (e) => {
            e.stopPropagation();
            previewSegment(videoId, segment.segmentNumber);
        };
        
        container.appendChild(block);
    });
}

function jumpToSegment(videoId, segmentNumber) {
    const segment = segmentData[videoId].find(s => s.segmentNumber === segmentNumber);
    if (!segment) return;
    
    const player = document.getElementById(`${videoId}-player`);
    player.currentTime = segment.start;
    player.play();
}

function toggleSegment(segmentId, videoId, segmentNumber) {
    const tile = document.querySelector(`[data-segment-id="${segmentId}"]`);
    const progressBlock = document.getElementById(`progress-block-${segmentId}`);
    const button = tile ? tile.querySelector('.segment-include-btn') : null;
    const segment = segmentData[videoId] ? segmentData[videoId].find(s => s.id === segmentId) : null;
    
    if (!tile || !segment) return;
    
    if (selections[segmentId]) {
        delete selections[segmentId];
        tile.classList.remove('selected');
        if (progressBlock) {
            progressBlock.classList.remove('selected');
            progressBlock.classList.add('unselected');
        }
        if (button) button.textContent = 'Include';
        selectedDuration -= segment.duration;
    } else {
        selections[segmentId] = {
            videoName: videoId,
            youtubeId: segment.youtubeId,
            segmentNumber: segmentNumber,
            selected: 1,
            segment: segment
        };
        tile.classList.add('selected');
        if (progressBlock) {
            progressBlock.classList.remove('unselected');
            progressBlock.classList.add('selected');
        }
        if (button) button.textContent = 'Remove';
        selectedDuration += segment.duration;
    }
    
    updateProgress();
    updateVideoPreviewButton(videoId);
}

function previewSegment(videoId, segmentNumber) {
    const segment = segmentData[videoId].find(s => s.segmentNumber === segmentNumber);
    if (!segment) return;
    
    const player = document.getElementById(`${videoId}-player`);
    player.currentTime = segment.start;
    player.play();
    
    const checkTime = setInterval(() => {
        if (player.currentTime >= segment.end) {
            player.pause();
            clearInterval(checkTime);
        }
    }, 100);
}

function updatePlayhead(videoId) {
    const player = document.getElementById(`${videoId}-player`);
    const videoNum = videoId.replace('video', '');
    const playhead = document.getElementById(`v${videoNum}-playhead`);
    const progressBar = document.getElementById(`v${videoNum}-progress-bar`);
    const currentTimeLabel = document.getElementById(`v${videoNum}-current-time`);
    
    const percentage = (player.currentTime / player.duration) * 100;
    playhead.style.left = `${percentage}%`;
    progressBar.style.width = `${percentage}%`;
    currentTimeLabel.textContent = formatTime(player.currentTime);
}

function seekVideo(event, videoId) {
    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = x / rect.width;
    
    const player = document.getElementById(`${videoId}-player`);
    player.currentTime = percentage * player.duration;
}

function updateProgress() {
    const percentage = totalDuration > 0 ? (selectedDuration / totalDuration * 100) : 0;
    
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

function updateVideoPreviewButton(videoId) {
    const previewButton = document.getElementById(`preview-btn-${videoId}`);
    if (!previewButton) return;
    
    // Count selected segments for this video
    const videoSelections = Object.keys(selections).filter(segId => 
        selections[segId].videoName === videoId
    );
    
    previewButton.disabled = videoSelections.length === 0;
}

// Video-specific preview functionality
function startVideoPreview(videoId) {
    const state = videoPreviewState[videoId];
    if (!state) return;
    
    // Build preview queue for this video only
    state.queue = [];
    const segments = segmentData[videoId];
    
    segments.forEach(segment => {
        if (selections[segment.id]) {
            state.queue.push({
                segmentId: segment.id,
                segment: segment
            });
        }
    });
    
    if (state.queue.length === 0) return;
    
    state.currentIndex = 0;
    state.isPlaying = true;
    
    // Update UI
    document.getElementById(`preview-btn-${videoId}`).classList.add('hidden');
    document.getElementById(`stop-btn-${videoId}`).classList.remove('hidden');
    
    // Start playing
    playNextVideoSegment(videoId);
}

function playNextVideoSegment(videoId) {
    const state = videoPreviewState[videoId];
    if (!state || !state.isPlaying || state.currentIndex >= state.queue.length) {
        stopVideoPreview(videoId);
        return;
    }
    
    const current = state.queue[state.currentIndex];
    const player = document.getElementById(`${videoId}-player`);
    
    // Highlight current segment
    clearVideoPreviewHighlights(videoId);
    const tile = document.querySelector(`[data-segment-id="${current.segmentId}"]`);
    const progressBlock = document.getElementById(`progress-block-${current.segmentId}`);
    if (tile) tile.classList.add('preview-playing');
    if (progressBlock) progressBlock.classList.add('preview-playing');
    
    // Play segment
    player.currentTime = current.segment.start;
    player.play();
    
    // Monitor playback
    if (state.interval) clearInterval(state.interval);
    state.interval = setInterval(() => {
        if (player.currentTime >= current.segment.end || player.paused) {
            clearInterval(state.interval);
            state.currentIndex++;
            setTimeout(() => playNextVideoSegment(videoId), 500); // Small delay between segments
        }
    }, 100);
}

function stopVideoPreview(videoId) {
    const state = videoPreviewState[videoId];
    if (!state) return;
    
    state.isPlaying = false;
    
    // Clear interval
    if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
    }
    
    // Pause video
    const player = document.getElementById(`${videoId}-player`);
    if (player) player.pause();
    
    // Clear highlights
    clearVideoPreviewHighlights(videoId);
    
    // Update UI
    document.getElementById(`preview-btn-${videoId}`).classList.remove('hidden');
    document.getElementById(`stop-btn-${videoId}`).classList.add('hidden');
}

function clearVideoPreviewHighlights(videoId) {
    // Clear highlights for segments of this video only
    const segments = segmentData[videoId];
    if (segments) {
        segments.forEach(segment => {
            const tile = document.querySelector(`[data-segment-id="${segment.id}"]`);
            const progressBlock = document.getElementById(`progress-block-${segment.id}`);
            if (tile) tile.classList.remove('preview-playing');
            if (progressBlock) progressBlock.classList.remove('preview-playing');
        });
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

function includeCurrentSegment(videoId) {
    const player = document.getElementById(`${videoId}-player`);
    const currentTime = player.currentTime;
    
    const segment = segmentData[videoId].find(s => 
        currentTime >= s.start && currentTime <= s.end
    );
    
    if (segment) {
        if (!selections[segment.id]) {
            toggleSegment(segment.id, videoId, segment.segmentNumber);
        }
    } else {
        alert('No segment found at current playback position');
    }
}

function saveResults() {
    const percentage = totalDuration > 0 ? (selectedDuration / totalDuration * 100) : 0;
    
    // パーセンテージチェック
    if (percentage < 5 || percentage > 15) {
        const message = `Please select between 5% and 15% of segments.\nCurrent: ${percentage.toFixed(1)}%`;
        
        if (cityInfo.mode === 'amt') {
            // AMTモードの場合は親ウィンドウに通知
            window.parent.postMessage({
                type: 'save-error',
                message: message,
                percentage: percentage
            }, '*');
        }
        alert(message);
        return;
    }
    
    const formattedData = {};
    
    // Format data by YouTube ID
    Object.keys(segmentData).forEach(videoId => {
        const segments = segmentData[videoId];
        if (segments.length === 0) return;
        
        const youtubeId = segments[0].youtubeId;
        formattedData[youtubeId] = {};
        
        segments.forEach(segment => {
            formattedData[youtubeId][`segment_${segment.segmentNumber}`] = 
                selections[segment.id] ? 1 : 0;
        });
    });
    
    const results = {
        city: cityInfo.cityName,
        area: cityInfo.area,
        place: cityInfo.place,
        selections: formattedData,
        total_segments: Object.values(segmentData).reduce((sum, segments) => sum + segments.length, 0),
        selected_segments: Object.keys(selections).length,
        percentage: percentage,
        timestamp: new Date().toISOString()
    };
    
    console.log('Saving results:', results); // デバッグ用
    
    // If in AMT mode, send message to parent
    if (cityInfo.mode === 'amt') {
        window.parent.postMessage({
            type: 'results-saved',
            results: results
        }, '*');
    } else {
        // Standalone mode - download results
        downloadResults(results);
        alert('Results saved successfully!');
    }
}

function downloadResults(results) {
    const dataStr = JSON.stringify(results, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${cityInfo.cityName}_results_${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

function showError(message) {
    const videosSection = document.getElementById('videos-section');
    videosSection.innerHTML = `
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
window.seekVideo = seekVideo;
window.saveResults = saveResults;
window.startVideoPreview = startVideoPreview;
window.stopVideoPreview = stopVideoPreview;

// AMTモードでのメッセージ受信設定
if (window.location.search.includes('mode=amt')) {
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'save-request') {
            saveResults();
        }
    });
}