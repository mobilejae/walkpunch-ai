import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { analyzeDefectWithAI, ParsedPunchItem } from '../services/gemini';
import {
  saveCsvToDevice,
  savePdfToDevice,
  shareCsvReport,
  sharePdfReport,
} from '../services/pdfGenerator';
import {
  CapturedDefect,
  getDefectMarkers,
  useInspectionStore,
} from '../store/inspectionStore';

const SEVERITIES: Array<ParsedPunchItem['severity']> = ['Low', 'Medium', 'High', 'Critical'];
const BASE_FILTERS = ['All', 'Open', 'Resolved', 'Critical', 'High', 'Medium', 'Low'];

function isPendingAiSync(item: CapturedDefect): boolean {
  if (item.status === 'error') return true;
  if (item.aiData?.defectTitle === 'Logged Defect (Tap Edit or Retry AI)') return true;
  return false;
}

export default function ReviewScreen() {
  const router = useRouter();
  const audioPlayer = useAudioPlayer(null);
  const {
    propertyName,
    inspectorName,
    setPropertyName,
    setInspectorName,
    defects,
    updateDefect,
    addDefectMarker,
    undoDefectMarker,
    clearDefectMarkers,
    toggleDefectResolved,
    updateDefectAiData,
    deleteDefect,
  } = useInspectionStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [lightboxItemId, setLightboxItemId] = useState<string | null>(null);
  const [isMarkerMode, setIsMarkerMode] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 320, height: 320 });

  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const touchState = useRef({
    initialDistance: 0,
    initialScale: 1,
    startTouchX: 0,
    startTouchY: 0,
    isPinching: false,
  });

  const lightboxItem = defects.find((d) => d.id === lightboxItemId) || null;
  const activeLightboxMarkers = getDefectMarkers(lightboxItem);
  const openCount = defects.filter((d) => !d.resolved).length;
  const resolvedCount = defects.filter((d) => d.resolved).length;
  const pendingAiItems = defects.filter(isPendingAiSync);

  // Dynamically extract unique trades logged on this jobsite
  const loggedTrades = Array.from(
    new Set(
      defects
        .map((d) => d.aiData?.trade?.trim())
        .filter((t): t is string => Boolean(t))
    )
  );
  const filterOptions = [...BASE_FILTERS, ...loggedTrades];

  const filteredDefects = defects.filter((item) => {
    if (selectedFilter === 'Open' && item.resolved) return false;
    if (selectedFilter === 'Resolved' && !item.resolved) return false;
    if (
      ['Critical', 'High', 'Medium', 'Low'].includes(selectedFilter) &&
      item.aiData?.severity !== selectedFilter
    ) {
      return false;
    }
    if (
      !BASE_FILTERS.includes(selectedFilter) &&
      item.aiData?.trade?.trim() !== selectedFilter
    ) {
      return false;
    }

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const loc = item.aiData?.location?.toLowerCase() || '';
      const trade = item.aiData?.trade?.toLowerCase() || '';
      const title = item.aiData?.defectTitle?.toLowerCase() || '';
      const desc = item.aiData?.description?.toLowerCase() || '';
      const act = item.aiData?.recommendedAction?.toLowerCase() || '';
      return (
        loc.includes(q) ||
        trade.includes(q) ||
        title.includes(q) ||
        desc.includes(q) ||
        act.includes(q)
      );
    }

    return true;
  });

  const activeScopeLabel =
    searchQuery.trim().length > 0
      ? searchQuery.trim()
      : selectedFilter !== 'All'
      ? selectedFilter
      : undefined;

  function openLightbox(item: CapturedDefect) {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsMarkerMode(false);
    setLightboxItemId(item.id);
  }

  function closeLightbox() {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsMarkerMode(false);
    setLightboxItemId(null);
  }

  function setPresetZoom(targetScale: number) {
    setIsMarkerMode(false);
    setZoomScale(targetScale);
    if (targetScale === 1) {
      setPanOffset({ x: 0, y: 0 });
    }
  }

  function toggleMarkerMode() {
    const nextMode = !isMarkerMode;
    setIsMarkerMode(nextMode);
    if (nextMode) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }

  function getTouchDistance(touches: any[]) {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.hypot(dx, dy);
  }

  function handleLightboxTouchStart(e: any) {
    const touches = e.nativeEvent.touches;

    if (isMarkerMode && touches.length === 1 && lightboxItem) {
      const { locationX, locationY } = e.nativeEvent;
      const xPct = Math.min(Math.max((locationX / canvasSize.width) * 100, 4), 96);
      const yPct = Math.min(Math.max((locationY / canvasSize.height) * 100, 4), 96);
      addDefectMarker(lightboxItem.id, {
        xPct: Math.round(xPct * 10) / 10,
        yPct: Math.round(yPct * 10) / 10,
      });
      return;
    }

    if (touches.length === 2) {
      touchState.current.isPinching = true;
      touchState.current.initialDistance = getTouchDistance(touches);
      touchState.current.initialScale = zoomScale;
    } else if (touches.length === 1 && zoomScale > 1) {
      touchState.current.isPinching = false;
      touchState.current.startTouchX = touches[0].pageX - panOffset.x;
      touchState.current.startTouchY = touches[0].pageY - panOffset.y;
    }
  }

  function handleLightboxTouchMove(e: any) {
    if (isMarkerMode) return;
    const touches = e.nativeEvent.touches;
    if (touches.length === 2) {
      const currentDist = getTouchDistance(touches);
      if (touchState.current.initialDistance > 0) {
        const ratio = currentDist / touchState.current.initialDistance;
        const nextScale = Math.min(
          Math.max(touchState.current.initialScale * ratio, 1),
          4
        );
        setZoomScale(nextScale);
        if (nextScale <= 1.05) {
          setPanOffset({ x: 0, y: 0 });
        }
      }
    } else if (
      touches.length === 1 &&
      zoomScale > 1 &&
      !touchState.current.isPinching
    ) {
      const nextX = touches[0].pageX - touchState.current.startTouchX;
      const nextY = touches[0].pageY - touchState.current.startTouchY;
      setPanOffset({ x: nextX, y: nextY });
    }
  }

  function handleLightboxTouchEnd(e: any) {
    const touches = e.nativeEvent.touches;
    if (touches.length < 2) {
      touchState.current.isPinching = false;
    }
    if (touches.length === 1 && zoomScale > 1) {
      touchState.current.startTouchX = touches[0].pageX - panOffset.x;
      touchState.current.startTouchY = touches[0].pageY - panOffset.y;
    }
  }

  async function playVoiceNote(audioUri: string | null) {
    if (!audioUri) return;
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      audioPlayer.replace({ uri: audioUri });
      audioPlayer.play();
    } catch (error) {
      Alert.alert('Playback Error', 'Could not play voice recording.');
    }
  }

  async function handleSavePdf() {
    if (filteredDefects.length === 0) {
      Alert.alert('No Punch Items', 'No items match the current view to export.');
      return;
    }
    try {
      setIsExportingPdf(true);
      const savedFileName = await savePdfToDevice(
        propertyName,
        inspectorName,
        filteredDefects,
        activeScopeLabel
      );
      if (savedFileName) {
        Alert.alert(
          'PDF Saved to Phone',
          `${savedFileName} (${filteredDefects.length} items) saved to your device folder.`
        );
      }
    } catch (error: any) {
      Alert.alert('PDF Save Error', error?.message || 'Could not save PDF to device.');
    } finally {
      setIsExportingPdf(false);
    }
  }

  async function handleSharePdf() {
    if (filteredDefects.length === 0) {
      Alert.alert('No Punch Items', 'No items match the current view to share.');
      return;
    }
    try {
      setIsExportingPdf(true);
      await sharePdfReport(
        propertyName,
        inspectorName,
        filteredDefects,
        activeScopeLabel
      );
    } catch (error: any) {
      Alert.alert('PDF Share Error', error?.message || 'Could not share PDF file.');
    } finally {
      setIsExportingPdf(false);
    }
  }

  async function handleSaveCsv() {
    if (filteredDefects.length === 0) {
      Alert.alert('No Punch Items', 'No items match the current view to export.');
      return;
    }
    try {
      setIsExportingPdf(true);
      const savedFileName = await saveCsvToDevice(
        propertyName,
        inspectorName,
        filteredDefects,
        activeScopeLabel
      );
      if (savedFileName) {
        Alert.alert(
          'CSV Saved to Phone',
          `${savedFileName} (${filteredDefects.length} items) saved to your device folder.`
        );
      }
    } catch (error: any) {
      Alert.alert('CSV Save Error', error?.message || 'Could not save CSV to device.');
    } finally {
      setIsExportingPdf(false);
    }
  }

  async function handleShareCsv() {
    if (filteredDefects.length === 0) {
      Alert.alert('No Punch Items', 'No items match the current view to share.');
      return;
    }
    try {
      setIsExportingPdf(true);
      await shareCsvReport(
        propertyName,
        inspectorName,
        filteredDefects,
        activeScopeLabel
      );
    } catch (error: any) {
      Alert.alert('CSV Share Error', error?.message || 'Could not share CSV file.');
    } finally {
      setIsExportingPdf(false);
    }
  }

  async function retryAiAnalysis(item: CapturedDefect) {
    if (!item.audioUri) {
      Alert.alert('Missing Audio', 'No voice recording found for this item.');
      return;
    }
    try {
      setEditingId(null);
      updateDefect(item.id, { status: 'analyzing', errorMessage: undefined });
      const aiResult = await analyzeDefectWithAI(item.photoUri, item.audioUri);
      updateDefect(item.id, { status: 'ready', aiData: aiResult });
    } catch (error: any) {
      const msg = error?.message || 'AI parsing failed';
      updateDefect(item.id, { status: 'error', errorMessage: msg });
      Alert.alert('Retry Failed', msg);
    }
  }

  async function handleBatchSyncPendingAi() {
    if (pendingAiItems.length === 0 || isBatchSyncing) return;
    try {
      setIsBatchSyncing(true);
      for (const item of pendingAiItems) {
        if (!item.audioUri) continue;
        updateDefect(item.id, { status: 'analyzing', errorMessage: undefined });
        const aiResult = await analyzeDefectWithAI(item.photoUri, item.audioUri);
        updateDefect(item.id, { status: 'ready', aiData: aiResult });
      }
      Alert.alert(
        'Batch AI Sync Complete',
        `Processed ${pendingAiItems.length} pending punch ${
          pendingAiItems.length === 1 ? 'item' : 'items'
        }.`
      );
    } catch (error: any) {
      Alert.alert('Batch Sync Error', error?.message || 'Some items could not be analyzed.');
    } finally {
      setIsBatchSyncing(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert('Delete Punch Item', 'Remove this item from the jobsite punch list?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDefect(id) },
    ]);
  }

  function getSeverityColor(severity?: string) {
    switch (severity) {
      case 'Critical':
        return '#EF4444';
      case 'High':
        return '#F97316';
      case 'Medium':
        return '#EAB308';
      default:
        return '#22C55E';
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Jobsite Punch List</Text>
        <TouchableOpacity onPress={() => router.push('/walkthrough')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Camera</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.propertyCard}>
          <Text style={styles.label}>JOBSITE / PROJECT / UNIT</Text>
          <TextInput
            style={styles.propertyInput}
            value={propertyName}
            onChangeText={setPropertyName}
            placeholder="e.g., 110 Oak St - Pre-Closing Walk"
            placeholderTextColor="#64748B"
          />

          <Text style={styles.label}>SUPERINTENDENT / INSPECTOR</Text>
          <TextInput
            style={styles.propertyInput}
            value={inspectorName}
            onChangeText={setInspectorName}
            placeholder="Enter superintendent or inspector name..."
            placeholderTextColor="#64748B"
          />

          <View style={styles.statsRow}>
            <Text style={styles.summaryText}>
              Exporting {filteredDefects.length} of {defects.length} Items
              {activeScopeLabel ? ` (${activeScopeLabel})` : ''}
            </Text>
            <Text style={styles.signOffStatsText}>
              {openCount} Open • {resolvedCount} Signed Off
            </Text>
          </View>

          {pendingAiItems.length > 0 && (
            <TouchableOpacity
              style={[styles.batchSyncBtn, isBatchSyncing && styles.disabledBtn]}
              onPress={handleBatchSyncPendingAi}
              disabled={isBatchSyncing}
            >
              {isBatchSyncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.batchSyncBtnText}>
                  ⚡ Sync {pendingAiItems.length} Pending AI{' '}
                  {pendingAiItems.length === 1 ? 'Item' : 'Items'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {defects.length > 0 && (
            <View style={styles.exportGrid}>
              <View style={styles.exportRow}>
                <TouchableOpacity
                  style={[styles.pdfSaveBtn, isExportingPdf && styles.disabledBtn]}
                  onPress={handleSavePdf}
                  disabled={isExportingPdf}
                >
                  {isExportingPdf ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text numberOfLines={1} style={styles.pdfBtnText}>
                      💾 Save PDF
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pdfShareBtn, isExportingPdf && styles.disabledBtn]}
                  onPress={handleSharePdf}
                  disabled={isExportingPdf}
                >
                  <Text numberOfLines={1} style={styles.pdfBtnText}>
                    📤 Share PDF
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.exportRow}>
                <TouchableOpacity
                  style={[styles.csvSaveBtn, isExportingPdf && styles.disabledBtn]}
                  onPress={handleSaveCsv}
                  disabled={isExportingPdf}
                >
                  <Text numberOfLines={1} style={styles.pdfBtnText}>
                    💾 Save CSV
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.csvShareBtn, isExportingPdf && styles.disabledBtn]}
                  onPress={handleShareCsv}
                  disabled={isExportingPdf}
                >
                  <Text numberOfLines={1} style={styles.pdfBtnText}>
                    📤 Share CSV
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {defects.length > 0 && (
          <>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="🔍 Filter by room, trade, or sub (e.g., Drywall, Kitchen, Plumbing)..."
              placeholderTextColor="#64748B"
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterBar}
            >
              {filterOptions.map((filter) => {
                const active = selectedFilter === filter;
                return (
                  <TouchableOpacity
                    key={filter}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setSelectedFilter(filter)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {filter}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {filteredDefects.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              {defects.length === 0
                ? 'No Punch Items Logged Yet'
                : 'No Matching Punch Items'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {defects.length === 0
                ? 'Return to the camera walkthrough to capture photos and voice notes.'
                : 'Clear your search query or switch the filter chip above.'}
            </Text>
            {defects.length === 0 && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.push('/walkthrough')}
              >
                <Text style={styles.primaryBtnText}>+ Capture First Punch Item</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredDefects.map((item, index) => {
            const isEditing = editingId === item.id;
            const isResolved = Boolean(item.resolved);
            const itemMarkers = getDefectMarkers(item);
            const tradeName = item.aiData?.trade || 'General Punch';

            return (
              <View
                key={item.id}
                style={[styles.defectCard, isResolved && styles.defectCardResolved]}
              >
                <View style={styles.cardTopRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => openLightbox(item)}
                    style={styles.thumbWrapper}
                  >
                    <Image source={{ uri: item.photoUri }} style={styles.defectImage} />
                    {itemMarkers.map((m, mIdx) => (
                      <View
                        key={`${item.id}-m-${mIdx}`}
                        pointerEvents="none"
                        style={[
                          styles.thumbMarkerRing,
                          {
                            left: `${m.xPct}%`,
                            top: `${m.yPct}%`,
                          },
                        ]}
                      />
                    ))}
                    <View style={styles.zoomHintBadge}>
                      <Text style={styles.zoomHintText}>
                        {itemMarkers.length > 0
                          ? `🎯 ${itemMarkers.length}`
                          : '🔍 Zoom'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.cardTopInfo}>
                    <View style={styles.badgeRow}>
                      <Text style={styles.itemIndex}>#{filteredDefects.length - index}</Text>
                      <Text style={styles.timestampText}>{item.timestamp}</Text>
                      {item.aiData && (
                        <View
                          style={[
                            styles.severityBadge,
                            { backgroundColor: getSeverityColor(item.aiData.severity) },
                          ]}
                        >
                          <Text style={styles.severityBadgeText}>{item.aiData.severity}</Text>
                        </View>
                      )}
                      {isResolved && (
                        <View style={styles.resolvedBadge}>
                          <Text style={styles.resolvedBadgeText}>✓ SIGNED OFF</Text>
                        </View>
                      )}
                    </View>

                    {item.status === 'analyzing' && (
                      <Text style={styles.analyzingText}>⏳ AI analyzing...</Text>
                    )}

                    {item.status === 'error' && (
                      <Text style={styles.errorText}>⚠️ {item.errorMessage}</Text>
                    )}

                    {item.aiData && !isEditing && (
                      <>
                        <View style={styles.locTradeRow}>
                          <Text style={styles.locationText}>{item.aiData.location}</Text>
                          <Text style={styles.tradeBadgeText}>• {tradeName}</Text>
                        </View>
                        <Text
                          style={[
                            styles.titleText,
                            isResolved && styles.titleTextResolved,
                          ]}
                        >
                          {item.aiData.defectTitle}
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                {item.aiData && !isEditing && (
                  <View style={styles.detailsBox}>
                    <Text style={styles.descText}>{item.aiData.description}</Text>
                    <Text style={styles.actionText}>
                      🛠 {tradeName}: {item.aiData.recommendedAction}
                    </Text>
                    {isResolved && item.resolvedAt && (
                      <Text style={styles.resolvedTimestampText}>
                        ✓ Verified &amp; signed off on {item.resolvedAt}
                      </Text>
                    )}
                  </View>
                )}

                {item.aiData && isEditing && (
                  <View style={styles.editForm}>
                    <Text style={styles.editLabel}>Location / Room</Text>
                    <TextInput
                      style={styles.editInput}
                      value={item.aiData.location}
                      onChangeText={(val) => updateDefectAiData(item.id, { location: val })}
                    />

                    <Text style={styles.editLabel}>Assigned Trade / Subcontractor</Text>
                    <TextInput
                      style={styles.editInput}
                      value={item.aiData.trade || ''}
                      placeholder="e.g., Drywall & Paint, Plumbing, Electrical"
                      placeholderTextColor="#64748B"
                      onChangeText={(val) => updateDefectAiData(item.id, { trade: val })}
                    />

                    <Text style={styles.editLabel}>Punch Item Title</Text>
                    <TextInput
                      style={styles.editInput}
                      value={item.aiData.defectTitle}
                      onChangeText={(val) => updateDefectAiData(item.id, { defectTitle: val })}
                    />

                    <Text style={styles.editLabel}>Severity</Text>
                    <View style={styles.severityPicker}>
                      {SEVERITIES.map((sev) => (
                        <TouchableOpacity
                          key={sev}
                          style={[
                            styles.sevOption,
                            item.aiData?.severity === sev && {
                              backgroundColor: getSeverityColor(sev),
                              borderColor: '#FFFFFF',
                            },
                          ]}
                          onPress={() => updateDefectAiData(item.id, { severity: sev })}
                        >
                          <Text style={styles.sevOptionText}>{sev}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.editLabel}>Field Observation</Text>
                    <TextInput
                      style={[styles.editInput, styles.multilineInput]}
                      multiline
                      value={item.aiData.description}
                      onChangeText={(val) => updateDefectAiData(item.id, { description: val })}
                    />

                    <Text style={styles.editLabel}>Corrective Scope of Work</Text>
                    <TextInput
                      style={styles.editInput}
                      value={item.aiData.recommendedAction}
                      onChangeText={(val) =>
                        updateDefectAiData(item.id, { recommendedAction: val })
                      }
                    />
                  </View>
                )}

                <View style={styles.cardActionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.resolveBtn,
                      isResolved && styles.resolveBtnActive,
                    ]}
                    onPress={() => toggleDefectResolved(item.id)}
                  >
                    <Text
                      style={[
                        styles.resolveBtnText,
                        isResolved && styles.resolveBtnTextActive,
                      ]}
                    >
                      {isResolved ? '✓ Signed Off' : '○ Sign Off'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.audioBtn}
                    onPress={() => playVoiceNote(item.audioUri)}
                  >
                    <Text style={styles.audioBtnText}>▶ Voice</Text>
                  </TouchableOpacity>

                  {item.aiData && (
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => setEditingId(isEditing ? null : item.id)}
                    >
                      <Text style={styles.editBtnText}>
                        {isEditing ? '✓ Done' : '✎ Edit'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {item.status !== 'analyzing' && (
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={() => retryAiAnalysis(item)}
                    >
                      <Text style={styles.retryBtnText}>↻ AI</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => confirmDelete(item.id)}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={Boolean(lightboxItem)}
        transparent
        animationType="fade"
        onRequestClose={closeLightbox}
      >
        <View style={styles.lightboxBackdrop}>
          <View style={styles.lightboxHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lightboxLocation}>
                {lightboxItem?.aiData?.location || 'JOBSITE PHOTO'} •{' '}
                {lightboxItem?.aiData?.trade || 'General Punch'}
              </Text>
              <Text style={styles.lightboxTitle}>
                {lightboxItem?.aiData?.defectTitle || 'Captured Punch Item'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.lightboxCloseBtn}
              onPress={closeLightbox}
            >
              <Text style={styles.lightboxCloseText}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.lightboxCanvas,
              isMarkerMode && styles.lightboxCanvasMarkerActive,
            ]}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width > 0 && height > 0) {
                setCanvasSize({ width, height });
              }
            }}
            onTouchStart={handleLightboxTouchStart}
            onTouchMove={handleLightboxTouchMove}
            onTouchEnd={handleLightboxTouchEnd}
          >
            {lightboxItem && (
              <View
                style={[
                  styles.lightboxTransformBox,
                  {
                    transform: [
                      { translateX: panOffset.x },
                      { translateY: panOffset.y },
                      { scale: zoomScale },
                    ],
                  },
                ]}
              >
                <Image
                  source={{ uri: lightboxItem.photoUri }}
                  style={styles.lightboxImage}
                  resizeMode="cover"
                />
                {activeLightboxMarkers.map((m, mIdx) => (
                  <View
                    key={`lb-marker-${mIdx}`}
                    pointerEvents="none"
                    style={[
                      styles.lightboxMarkerRing,
                      {
                        left: `${m.xPct}%`,
                        top: `${m.yPct}%`,
                      },
                    ]}
                  >
                    <Text style={styles.lightboxMarkerNumber}>{mIdx + 1}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.zoomControlsRow}>
            <View style={styles.markerButtonsGroup}>
              <TouchableOpacity
                style={[
                  styles.markerModeBtn,
                  isMarkerMode && styles.markerModeBtnActive,
                ]}
                onPress={toggleMarkerMode}
              >
                <Text style={styles.markerModeBtnText}>
                  {isMarkerMode
                    ? `✓ Done (${activeLightboxMarkers.length})`
                    : '🎯 + Mark Spot'}
                </Text>
              </TouchableOpacity>

              {lightboxItem && activeLightboxMarkers.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.undoMarkerBtn}
                    onPress={() => undoDefectMarker(lightboxItem.id)}
                  >
                    <Text style={styles.undoMarkerText}>↩ Undo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.clearMarkerBtn}
                    onPress={() => clearDefectMarkers(lightboxItem.id)}
                  >
                    <Text style={styles.clearMarkerText}>Clear</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={styles.zoomButtonsGroup}>
              {[1, 2, 3].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.zoomPresetBtn,
                    Math.round(zoomScale) === preset &&
                      !isMarkerMode &&
                      styles.zoomPresetBtnActive,
                  ]}
                  onPress={() => setPresetZoom(preset)}
                >
                  <Text style={styles.zoomPresetText}>{preset}x</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {lightboxItem?.aiData && (
            <View style={styles.lightboxFooter}>
              <Text style={styles.lightboxDesc}>
                {lightboxItem.aiData.description}
              </Text>
              <Text style={styles.lightboxAction}>
                🛠 {lightboxItem.aiData.trade || 'Trade Scope'}:{' '}
                {lightboxItem.aiData.recommendedAction}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#334155' },
  backBtnText: { color: '#F8FAFC', fontWeight: '700', fontSize: 13 },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  addBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#2563EB' },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  scrollContent: { padding: 16, paddingBottom: 48 },
  propertyCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  label: { color: '#38BDF8', fontSize: 11, fontWeight: '800', marginBottom: 6 },
  propertyInput: {
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  signOffStatsText: { color: '#38BDF8', fontSize: 12, fontWeight: '800' },
  batchSyncBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  batchSyncBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  exportGrid: {
    gap: 8,
  },
  exportRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pdfSaveBtn: {
    flex: 1,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfShareBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  csvSaveBtn: {
    flex: 1,
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  csvShareBtn: {
    flex: 1,
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.6 },
  pdfBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  searchInput: {
    backgroundColor: '#1E293B',
    color: '#FFFFFF',
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  filterBar: { marginBottom: 14 },
  filterChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#38BDF8',
  },
  filterChipText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  emptyBox: { alignItems: 'center', padding: 36, backgroundColor: '#1E293B', borderRadius: 14 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptySubtitle: { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  primaryBtn: { backgroundColor: '#2563EB', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  defectCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  defectCardResolved: {
    borderColor: '#16A34A',
    backgroundColor: '#132235',
  },
  cardTopRow: { flexDirection: 'row', marginBottom: 10 },
  thumbWrapper: {
    width: 84,
    height: 84,
    borderRadius: 10,
    marginRight: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  defectImage: { width: 84, height: 84, borderRadius: 10 },
  thumbMarkerRing: {
    position: 'absolute',
    width: 16,
    height: 16,
    marginLeft: -8,
    marginTop: -8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#EF4444',
    backgroundColor: '#EF444444',
  },
  zoomHintBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#0F172ACC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  zoomHintText: { color: '#E2E8F0', fontSize: 9, fontWeight: '700' },
  cardTopInfo: { flex: 1, justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4, gap: 4 },
  itemIndex: { color: '#38BDF8', fontWeight: '800', fontSize: 12, marginRight: 4 },
  timestampText: { color: '#64748B', fontSize: 11, marginRight: 4 },
  severityBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  severityBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  resolvedBadge: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  resolvedBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  locTradeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  locationText: { color: '#38BDF8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  tradeBadgeText: { color: '#FBBF24', fontSize: 11, fontWeight: '800' },
  titleText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 2 },
  titleTextResolved: { color: '#86EFAC', textDecorationLine: 'line-through' },
  analyzingText: { color: '#38BDF8', fontSize: 13, fontWeight: '600' },
  errorText: { color: '#F87171', fontSize: 12 },
  detailsBox: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  descText: { color: '#CBD5E1', fontSize: 13, lineHeight: 19, marginBottom: 6 },
  actionText: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
  resolvedTimestampText: {
    color: '#4ADE80',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  editForm: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  editLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 4, marginTop: 6 },
  editInput: {
    backgroundColor: '#1E293B',
    color: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 13,
  },
  multilineInput: { minHeight: 60, textAlignVertical: 'top' },
  severityPicker: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  sevOption: {
    flex: 1,
    paddingVertical: 6,
    marginHorizontal: 3,
    borderRadius: 6,
    backgroundColor: '#334155',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sevOptionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  cardActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resolveBtn: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#16A34A',
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  resolveBtnActive: {
    backgroundColor: '#16A34A',
  },
  resolveBtnText: { color: '#4ADE80', fontSize: 11, fontWeight: '800' },
  resolveBtnTextActive: { color: '#FFFFFF' },
  audioBtn: { backgroundColor: '#2563EB', paddingVertical: 8, paddingHorizontal: 9, borderRadius: 8 },
  audioBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  editBtn: { backgroundColor: '#334155', paddingVertical: 8, paddingHorizontal: 9, borderRadius: 8 },
  editBtnText: { color: '#E2E8F0', fontSize: 11, fontWeight: '700' },
  retryBtn: { backgroundColor: '#0284C7', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  retryBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  deleteBtn: { paddingVertical: 8, paddingHorizontal: 8 },
  deleteBtnText: { color: '#F87171', fontSize: 13, fontWeight: '800' },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: '#000000F2',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  lightboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  lightboxLocation: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  lightboxTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  lightboxCloseBtn: {
    backgroundColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  lightboxCloseText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  lightboxCanvas: {
    flex: 1,
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#090D16',
    borderWidth: 1,
    borderColor: '#334155',
  },
  lightboxCanvasMarkerActive: {
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  lightboxTransformBox: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxMarkerRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    marginLeft: -18,
    marginTop: -18,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#EF4444',
    backgroundColor: '#EF444466',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxMarkerNumber: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  zoomControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 2,
  },
  markerButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  markerModeBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  markerModeBtnActive: {
    backgroundColor: '#EF4444',
  },
  markerModeBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  undoMarkerBtn: {
    backgroundColor: '#334155',
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  undoMarkerText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '800',
  },
  clearMarkerBtn: {
    backgroundColor: '#334155',
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  clearMarkerText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '800',
  },
  zoomButtonsGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  zoomPresetBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  zoomPresetBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#38BDF8',
  },
  zoomPresetText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  lightboxFooter: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  lightboxDesc: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  lightboxAction: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
});