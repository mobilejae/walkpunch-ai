import { useAudioPlayer } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
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
import { CapturedDefect, useInspectionStore } from '../store/inspectionStore';

const SEVERITIES: Array<ParsedPunchItem['severity']> = ['Low', 'Medium', 'High', 'Critical'];

export default function ReviewScreen() {
  const router = useRouter();
  const audioPlayer = useAudioPlayer(null);
  const {
    propertyName,
    setPropertyName,
    defects,
    updateDefect,
    updateDefectAiData,
    deleteDefect,
  } = useInspectionStore();

  const [editingId, setEditingId] = useState<string | null>(null);

  function playVoiceNote(audioUri: string | null) {
    if (!audioUri) return;
    try {
      audioPlayer.replace({ uri: audioUri });
      audioPlayer.play();
    } catch (error) {
      Alert.alert('Playback Error', 'Could not play voice recording.');
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
          <Text style={styles.summaryText}>
            Total Logged Defects: {defects.length}
          </Text>
        </View>

        {defects.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No Punch Items Logged Yet</Text>
            <Text style={styles.emptySubtitle}>
              Return to the camera walkthrough to capture photos and voice notes.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push('/walkthrough')}
            >
              <Text style={styles.primaryBtnText}>+ Capture First Defect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          defects.map((item, index) => {
            const isEditing = editingId === item.id;
            return (
              <View key={item.id} style={styles.defectCard}>
                <View style={styles.cardTopRow}>
                  <Image source={{ uri: item.photoUri }} style={styles.defectImage} />
                  <View style={styles.cardTopInfo}>
                    <View style={styles.badgeRow}>
                      <Text style={styles.itemIndex}>#{defects.length - index}</Text>
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
                      <Text style={styles.analyzingText}>⏳ Queued / AI analyzing...</Text>
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
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  label: { color: '#38BDF8', fontSize: 11, fontWeight: '800', marginBottom: 6 },
  propertyInput: {
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  summaryText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
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