import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>iGym hit an error and couldn't continue. Try restarting.</Text>
        <ScrollView style={styles.errorBox}>
          <Text style={styles.errorText}>{String(this.state.error?.message || this.state.error)}</Text>
          {this.state.info?.componentStack ? (
            <Text style={styles.stackText}>{this.state.info.componentStack}</Text>
          ) : null}
        </ScrollView>
        <TouchableOpacity style={styles.btn} onPress={this.reset}>
          <Text style={styles.btnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  icon: { fontSize: 56, marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#111', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#666', textAlign: 'center', marginBottom: 18, fontSize: 14 },
  errorBox: { maxHeight: 200, backgroundColor: '#FFF3F3', borderRadius: 10, padding: 14, marginBottom: 16, width: '100%' },
  errorText: { color: '#C62828', fontWeight: '600', fontSize: 13, marginBottom: 8 },
  stackText: { color: '#888', fontSize: 11, fontFamily: 'monospace' },
  btn: { backgroundColor: '#007AFF', paddingHorizontal: 36, paddingVertical: 14, borderRadius: 12 },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});
