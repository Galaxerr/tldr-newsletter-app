import React from 'react';
import { Linking, ScrollView, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { DeleteLocalDataButton } from '../components/DeleteLocalDataButton';
import { useToast } from '../context/ToastContext';
import { styles } from '../theme/css/AuthScreenStyles';

export function AccountScreen() {
  const { user, error, needsLogin, signIn, signOut } = useAuth();
  const { show } = useToast();
  // Google's account settings let the user revoke the grant, independently of local logout.
  const permissions = () => Linking.openURL('https://myaccount.google.com/connections')
    .catch(() => show('Impossibile aprire le impostazioni Google.', 'error'));
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Account</Text>
        {!!user.name && <Text style={styles.email}>{user.name}</Text>}
        <Text selectable style={styles.email}>{user.email}</Text>
        {needsLogin && <Text style={styles.error}>Collega nuovamente Gmail per riprendere la sincronizzazione. I sommari salvati restano disponibili.</Text>}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={signIn}><Text style={styles.buttonText}>{needsLogin ? 'Collega nuovamente Google' : 'Cambia account Google'}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={signOut}><Text style={styles.buttonText}>Esci</Text></TouchableOpacity>
        <DeleteLocalDataButton />
        <Text style={styles.text}>Uscendo, la libreria viene chiusa. I dati locali vengono conservati e saranno disponibili al prossimo accesso con lo stesso account. Uscire non revoca il permesso su Google.</Text>
        <TouchableOpacity accessibilityRole="link" style={styles.button} onPress={permissions}><Text style={styles.buttonText}>Gestisci o revoca i permessi su Google</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
