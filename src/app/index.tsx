import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useInspectionStore } from '../store/inspectionStore';

export default function HomeScreen() {
  const router = useRouter();
  const {
    propertyName,
    inspectorName,
    defects,
    savedProjects,
    isHydrated,
    archiveAndStartNew,
    loadArchivedProject,
    deleteArchivedProject,
    clearAll,
  } = useInspectionStore();

  const [showNewModal, setShowNewModal] = useState(false);
  const [newAddressInput, setNewAddressInput] = useState('');

  const openCount = defects.filter((d) => !d.resolved).length;
  const resolvedCount = defects.filter((d) => d.resolved).length;
  const criticalCount = defects.filter((d) => d.aiData?.severity === 'Critical').length;
  const highCount = defects.filter((d) => d.aiData?.severity === 'High').length;
  const mediumCount = defects.filter((d) => d.aiData?.severity === 'Medium').length;
  const lowCount = defects.filter((d) => d.aiData?.severity === 'Low').length;

  function handleStartNewProperty() {
    const address = newAddressInput.trim() || 'New Jobsite Punch Walk';
    archiveAndStartNew(address);
    setNewAddressInput('');
    setShowNewModal(false);
  }

  function confirmDeleteArchive(id: string, name: string) {
    Alert.alert(
      'Delete Saved Jobsite?',
      `Permanently remove "${name}" from your device archive?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteArchivedProject(id),
        },
      ]
    );
  }

  function confirmDiscardCurrent() {
    Alert.alert(
      'Discard Active Punch List?',
      'This will clear the current active walk without archiving it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => clearAll() },
      ]
    );
  }

  if (!isHydrated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingText}>Loading jobsite punch workspace...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>CONSTRUCTION • REMODELING • INSPECTION</Text>
        </View>

        <Text style={styles.title}>WalkPunch AI</Text>
        <Text style={styles.subtitle}>
          Point camera, speak room &amp; trade scope, and generate contractor-ready punch reports in seconds.
        </Text>

        <View style={styles.statusCard}>
          <View style={styles.statusHeaderRow}>
            <Text style={styles.statusLabel}>ACTIVE JOBSITE PUNCH WALK</Text>
            <TouchableOpacity
              style={styles.newPropertyChip}
              onPress={() => setShowNewModal(true)}
            >
              <Text style={styles.newPropertyChipText}>+ New Jobsite</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.propertyTitle}>{propertyName}</Text>
          <Text style={styles.inspectorText}>
            Superintendent / Inspector: {inspectorName}
          </Text>
          <Text style={styles.countText}>
            {defects.length} {defects.length === 1 ? 'Item' : 'Items'} Logged ({openCount} Open • {resolvedCount} Signed Off)
          </Text>

          {defects.length > 0 && (
            <View style={styles.pillsRow}>
              <View style={[styles.sevPill, { borderColor: '#EF4444' }]}>
                <Text style={[styles.sevPillText, { color: '#EF4444' }]}>
                  Crit: {criticalCount}
                </Text>
              </View>
              <View style={[styles.sevPill, { borderColor: '#F97316' }]}>
                <Text style={[styles.sevPillText, { color: '#F97316' }]}>
                  High: {highCount}
                </Text>
              </View>
              <View style={[styles.sevPill, { borderColor: '#EAB308' }]}>
                <Text style={[styles.sevPillText, { color: '#EAB308' }]}>
                  Med: {mediumCount}
                </Text>
              </View>
              <View style={[styles.sevPill, { borderColor: '#22C55E' }]}>
                <Text style={[styles.sevPillText, { color: '#22C55E' }]}>
                  Low: {lowCount}
                </Text>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/walkthrough')}
        >
          <Text style={styles.primaryButtonText}>
            {defects.length > 0 ? '📷 Resume Punch Walk' : '📷 Start Punch Walk'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/review')}
        >
          <Text style={styles.secondaryButtonText}>
            📋 Review, Trade Filter &amp; Export ({defects.length})
          </Text>
        </TouchableOpacity>

        {defects.length > 0 && (
          <TouchableOpacity
            style={styles.discardButton}
            onPress={confirmDiscardCurrent}
          >
            <Text style={styles.discardButtonText}>
              🗑 Discard Current Walk Without Saving
            </Text>
          </TouchableOpacity>
        )}

        {savedProjects.length > 0 && (
          <View style={styles.archiveSection}>
            <Text style={styles.archiveSectionTitle}>
              SAVED JOBSITE ARCHIVE ({savedProjects.length})
            </Text>

            {savedProjects.map((project) => (
              <View key={project.id} style={styles.archiveCard}>
                <View style={styles.archiveInfo}>
                  <Text style={styles.archivePropertyTitle}>
                    {project.propertyName}
                  </Text>
                  <Text style={styles.archiveMetaText}>
                    {project.defects.length}{' '}
                    {project.defects.length === 1 ? 'Item' : 'Items'} • Saved{' '}
                    {project.updatedAt}
                  </Text>
                </View>

                <View style={styles.archiveActions}>
                  <TouchableOpacity
                    style={styles.openArchiveBtn}
                    onPress={() => loadArchivedProject(project.id)}
                  >
                    <Text style={styles.openArchiveBtnText}>Open</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteArchiveBtn}
                    onPress={() =>
                      confirmDeleteArchive(project.id, project.propertyName)
                    }
                  >
                    <Text style={styles.deleteArchiveBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showNewModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start New Jobsite Walk</Text>
            <Text style={styles.modalSubtitle}>
              {defects.length > 0
                ? `"${propertyName}" (${defects.length} items) will be automatically saved to your archive.`
                : 'Enter the jobsite address, project name, or unit number.'}
            </Text>

            <TextInput
              style={styles.modalInput}
              value={newAddressInput}
              onChangeText={setNewAddressInput}
              placeholder="e.g., 1111 Ace Lane - Pre-Closing Walk"
              placeholderTextColor="#64748B"
              autoFocus
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowNewModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleStartNewProperty}
              >
                <Text style={styles.modalConfirmText}>
                  {defects.length > 0 ? 'Archive & Start' : 'Start Walk'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 15,
    marginTop: 12,
  },
  container: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 48,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 14,
  },
  badgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 6,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 22,
  },
  statusCard: {
    backgroundColor: '#1E293B',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 18,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  newPropertyChip: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  newPropertyChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  propertyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  inspectorText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  countText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  pillsRow: {
    flexDirection: 'row',
    marginTop: 12,
    justifyContent: 'space-between',
  },
  sevPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    marginHorizontal: 3,
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  sevPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#1E293B',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  discardButton: {
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  discardButtonText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '700',
  },
  archiveSection: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 18,
  },
  archiveSectionTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  archiveCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  archiveInfo: {
    flex: 1,
    marginRight: 10,
  },
  archivePropertyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 3,
  },
  archiveMetaText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  archiveActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  openArchiveBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openArchiveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  deleteArchiveBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteArchiveBtnText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#000000B3',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#334155',
  },
  modalCancelText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 14,
  },
  modalConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#2563EB',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});