import '../styles/synapt.css'
import { mount } from 'svelte'
import Demo from './Demo.svelte'

// Playground entry: mounts the theme against sample fixtures in
// public/sample/ (what a site build would produce). See README.org.
mount(Demo, { target: document.getElementById('app')! })
