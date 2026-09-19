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
    .catch(() => show('Unable to open Google settings.', 'error'));
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Account</Text>
        {!!user.name && <Text style={styles.email}>{user.name}</Text>}
        <Text selectable style={styles.email}>{user.email}</Text>
        {needsLogin && <Text style={styles.error}>Reconnect Gmail to resume syncing. Saved summaries remain available.</Text>}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={signIn}><Text style={styles.buttonText}>{needsLogin ? 'Reconnect Google' : 'Switch Google account'}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={signOut}><Text style={styles.buttonText}>Sign out</Text></TouchableOpacity>
        <DeleteLocalDataButton />
        <Text style={styles.text}>Signing out closes your library. Local data is kept and will be available when you sign in again with the same account. Signing out does not revoke Google permissions.</Text>
        <TouchableOpacity accessibilityRole="link" style={styles.button} onPress={permissions}><Text style={styles.buttonText}>Manage or revoke Google permissions</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
