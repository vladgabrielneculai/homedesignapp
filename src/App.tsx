import { EditorPage } from './components/EditorPage'
import { ProjectsPage } from './components/ProjectsPage'
import { useProject } from './state/store'

export default function App() {
  const project = useProject()
  return project ? <EditorPage key={project.id} /> : <ProjectsPage />
}
