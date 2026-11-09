import { useAudioPlayer } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { analyzeDefectWithAI, ParsedPunchItem } from '../services/gemini';
import { savePdfToDevice, sharePdfReport } from '../services/pdfGenerator';
import { CapturedDefect, useInspectionStore } from '../store/inspectionStore';

const SEVERITIES: Array<ParsedPunchItem['severity']> = ['Low', 'Medium', 'High', 'Critical'];
const FILTER_OPTIONS: Array<'All' | ParsedPunchItem['severity']> = [
  'All',
  'Critical',
  'High',
  'Medium',
  'Low',
];

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
    updateDefectAiData,
    deleteDefect,
  } = useInspectionStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'All' | ParsedPunchItem['severity']>('All');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const filteredDefects =
    selectedFilter === 'All'
      ? defects
      : defects.filter((item) => item.aiData?.severity === selectedFilter);

  function playVoiceNote(audioUri: string | null) {
    if (!audioUri) return;
    try {
      audioPlayer.replace({ uri: audioUri });
      audioPlayer.play();
    } catch (error) {
      Alert.alert('Playback Error', 'Could not play voice recording.');
    }
  }

  async function handleSavePdf() {
    if (defects.length === 0) {
      Alert.alert('No Punch Items', 'Log at least one defect before saving a PDF report.');
      return;
    }
    try {
      setIsExportingPdf(true);
      const savedFileName = await savePdfToDevice(propertyName, inspectorName, defects);
      if (savedFileName) {
        Alert.alert(
          'PDF Saved to Phone',
          `${savedFileName} was saved to your selected device folder.`
        );
      }
    } catch (error: any) {
      Alert.alert('PDF Save Error', error?.message || 'Could not save PDF to device.');
    } finally {
      setIsExportingPdf(false);
    }
  }

  async function handleSharePdf() {
    if (defects.length === 0) {
      Alert.alert('No Punch Items', 'Log at least one defect before sharing a PDF report.');
      return;
    }
    try {
      setIsExportingPdf(true);
      await sharePdfReport(propertyName, inspectorName, defects);
    } catch (error: any) {
      Alert.alert('PDF Share Error', error?.message || 'Could not share PDF file.');
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

  function confirmDelete(id: string) {
    Alert.alert('Delete Punch Item', 'Remove this defect from the inspection report?', [
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
        <Text style={styles.headerTitle}>Inspection Punch List</Text>
        <TouchableOpacity onPress={() => router.push('/walkthrough')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Camera</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.propertyCard}>
          <Text style={styles.label}>PROPERTY / PROJECT NAME</Text>
          <TextInput
            style={styles.propertyInput}
            value={propertyName}
            onChangeText={setPropertyName}
            placeholder="Enter property or unit name..."
            placeholderTextColor="#64748B"
          />

          <Text style={styles.label}>INSPECTOR / PREPARED BY</Text>
          <TextInput
            style={styles.propertyInput}
            value={inspectorName}
            onChangeText={setInspectorName}
            placeholder="Enter inspector name..."
            placeholderTextColor="#64748B"
          />

          <Text style={styles.summaryText}>
            Showing {filteredDefects.length} of {defects.length} Saved Defects
          </Text>

          {defects.length > 0 && (
            <View style={styles.pdfActionsRow}>
              <TouchableOpacity
                style={[styles.pdfSaveBtn, isExportingPdf && styles.disabledBtn]}
                onPress={handleSavePdf}
                disabled={isExportingPdf}
              >
                {isExportingPdf ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.pdfBtnText}>💾 Save PDF to Phone</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pdfShareBtn, isExportingPdf && styles.disabledBtn]}
                onPress={handleSharePdf}
                disabled={isExportingPdf}
              >
                <Text style={styles.pdfBtnText}>📤 Share PDF</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {defects.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterBar}
          >
            {FILTER_OPTIONS.map((filter) => {
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
        )}

        {filteredDefects.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              {defects.length === 0
                ? 'No Punch Items Logged Yet'
                : `No ${selectedFilter} Severity Items`}
            </Text>
            <Text style={styles.emptySubtitle}>
              {defects.length === 0
                ? 'Return to the camera walkthrough to capture photos and voice notes.'
                : 'Switch the filter above to view all logged defects.'}
            </Text>
            {defects.length === 0 && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.push('/walkthrough')}
              >
                <Text style={styles.primaryBtnText}>+ Capture First Defect</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredDefects.map((item, index) => {
            const isEditing = editingId === item.id;
            return (
              <View key={item.id} style={styles.defectCard}>
                <View style={styles.cardTopRow}>
                  <Image source={{ uri: item.photoUri }} style={styles.defectImage} />
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
                    </View>

                    {item.status === 'analyzing' && (
                      <Text style={styles.analyzingText}>⏳ AI analyzing...</Text>
                    )}

                    {item.status === 'error' && (
                      <Text style={styles.errorText}>⚠️ {item.errorMessage}</Text>
                    )}

                    {item.aiData && !isEditing && (
                      <>
                        <Text style={styles.locationText}>{item.aiData.location}</Text>
                        <Text style={styles.titleText}>{item.aiData.defectTitle}</Text>
                      </>
                    )}
                  </View>
                </View>

                {item.aiData && !isEditing && (
                  <View style={styles.detailsBox}>
                    <Text style={styles.descText}>{item.aiData.description}</Text>
                    <Text style={styles.actionText}>🛠 {item.aiData.recommendedAction}</Text>
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

                    <Text style={styles.editLabel}>Defect Title</Text>
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

                    <Text style={styles.editLabel}>Description</Text>
                    <TextInput
                      style={[styles.editInput, styles.multilineInput]}
                      multiline
                      value={item.aiData.description}
                      onChangeText={(val) => updateDefectAiData(item.id, { description: val })}
                    />

                    <Text style={styles.editLabel}>Recommended Action</Text>
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
                      <Text style={styles.retryBtnText}>↻ Retry AI</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => confirmDelete(item.id)}
                  >
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
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
  summaryText: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  pdfActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  pdfSaveBtn: {
    flex: 1,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  pdfShareBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabledBtn: { opacity: 0.6 },
  pdfBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
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
  cardTopRow: { flexDirection: 'row', marginBottom: 10 },
  defectImage: { width: 84, height: 84, borderRadius: 10, marginRight: 12 },
  cardTopInfo: { flex: 1, justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  itemIndex: { color: '#38BDF8', fontWeight: '800', fontSize: 12, marginRight: 8 },
  timestampText: { color: '#64748B', fontSize: 11, marginRight: 8 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  severityBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  locationText: { color: '#38BDF8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  titleText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 2 },
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
  audioBtn: { backgroundColor: '#2563EB', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  audioBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  editBtn: { backgroundColor: '#334155', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  editBtnText: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  retryBtn: { backgroundColor: '#0284C7', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  retryBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  deleteBtn: { paddingVertical: 8, paddingHorizontal: 8 },
  deleteBtnText: { color: '#F87171', fontSize: 12, fontWeight: '700' },
});