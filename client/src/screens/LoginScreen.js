import React from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { getGoogleModule } from '../services/auth';
import { styles } from '../theme/css/AuthScreenStyles';

// Use Google's branded native button; unsupported builds still display an actionable error.
function SignInButton({ onPress }) {
  let Button;
  try { Button = getGoogleModule().GoogleSignInButton; } catch { /* Show setup guidance when tapped. */ }
  if (Button) return <Button size="standard" colorScheme="light" signInBehavior="none" onPress={onPress} style={styles.googleButton} />;
  return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.button}><Text style={styles.buttonText}>Accedi con Google</Text></TouchableOpacity>;
}

export function LoginScreen() {
  const { signIn, error } = useAuth();
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Le tue newsletter, in un unico posto.</Text>
        <Text style={styles.text}>Scegli l’account Google che riceve le newsletter TLDR.</Text>
        <Text style={styles.text}>Google ti chiederà il permesso di leggere Gmail. Il permesso copre le email della casella; l’app lo usa per cercare e importare le newsletter TLDR. Non invia, elimina o modifica email.</Text>
        <Text style={styles.text}>I sommari, i salvati e lo stato di lettura rimangono sul dispositivo, separati per account, e sono consultabili offline dopo il primo accesso.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <SignInButton onPress={signIn} />
      </ScrollView>
    </SafeAreaView>
  );
}
